// supabase/functions/generate-content/index.ts
// Gemini 2.5 Flash 기반 블로그 글 생성 Edge Function
//
// 요청:  POST /functions/v1/generate-content
//        Authorization: Bearer <supabase_jwt>
//        Content-Type:  application/json
//        Body: { topic: string, options?: GenerateOptions }
//
// 성공:  { ok: true, data: { content: string, tokensUsed: number,
//                            model: string, finishReason: string,
//                            quota: {...} } }
// 실패:  { ok: false, error: { code: string, message: string, details?: any } }
//
// 처리 순서(supabase-migration-rules §4 / boundary-qa §4-3 기준):
//   1) OPTIONS preflight 처리
//   2) 메서드 / Content-Type 검증
//   3) JWT 검증 + profiles 조회 → { supabase, userId, profile }
//   4) 입력 파싱 + 검증
//   5) 쿼터 체크 (minute/day) — Gemini 호출 전에 수행
//   6) Gemini 호출
//   7) usage_logs INSERT (성공/실패 모두)
//   8) 응답 반환

import { serve } from 'https://deno.land/std@0.220.0/http/server.ts'

import { authenticate, authErrorResponse } from '../_shared/auth.ts'
import {
  checkQuota,
  recordUsage,
  quotaErrorResponse,
  type Feature
} from '../_shared/usage.ts'
import {
  generateBlogContent,
  geminiErrorResponse,
  isGeminiError,
  type GenerateOptions
} from '../_shared/gemini.ts'
import { corsHeaders, handleOptions } from './cors.ts'

const FEATURE: Feature = 'generate_content'

type RequestBody = {
  topic?: unknown
  options?: unknown
}

serve(async (req: Request): Promise<Response> => {
  const cors = corsHeaders(req)

  // 1) Preflight
  if (req.method === 'OPTIONS') {
    return handleOptions(req)
  }

  // 2) 메서드 검증
  if (req.method !== 'POST') {
    return errorResponse('method_not_allowed', 'POST 요청만 허용됩니다.', 405, cors)
  }
  const contentType = req.headers.get('Content-Type') ?? ''
  if (!contentType.toLowerCase().includes('application/json')) {
    return errorResponse('invalid_content_type', 'Content-Type 은 application/json 이어야 합니다.', 415, cors)
  }

  // 3) 인증
  let ctx
  try {
    ctx = await authenticate(req)
  } catch (err) {
    return authErrorResponse(err, cors)
  }

  // 4) 입력 파싱 + 검증
  let topic: string
  let options: GenerateOptions
  try {
    const parsed = await parseBody(req)
    topic = parsed.topic
    options = parsed.options
  } catch (err) {
    const msg = err instanceof Error ? err.message : '요청 본문을 해석할 수 없습니다.'
    return errorResponse('invalid_input', msg, 400, cors)
  }

  // 5) 쿼터 체크 (Gemini 호출 전)
  const quota = await checkQuota(ctx.supabase, ctx.profile, FEATURE)
  if (!quota.allowed) {
    return quotaErrorResponse(quota, cors)
  }

  // 6) Gemini 호출
  let result
  try {
    result = await generateBlogContent(topic, {
      ...options,
      language: options.language ?? (ctx.profile.language as GenerateOptions['language']) ?? 'ko'
    })
  } catch (err) {
    // 업스트림 실패도 usage_logs 에는 남기지 않는다(비용 미발생).
    if (isGeminiError(err)) {
      // 관측 로그 — 사용자 식별자 + 에러 코드만. API 키/프롬프트 원문 로깅 금지.
      console.warn('[generate-content] gemini failed', {
        userId: ctx.userId,
        code: err.code,
        httpStatus: err.httpStatus
      })
    } else {
      console.warn('[generate-content] unexpected error', { userId: ctx.userId })
    }
    return geminiErrorResponse(err, cors)
  }

  // 7) usage_logs 기록 (성공 경로). 로그 실패는 응답에 영향 주지 않음.
  await recordUsage(ctx.supabase, ctx.userId, FEATURE, result.tokensUsed)

  // 8) 성공 응답
  return jsonResponse(
    {
      ok: true,
      data: {
        content: result.content,
        tokensUsed: result.tokensUsed,
        model: result.model,
        finishReason: result.finishReason,
        quota: {
          minuteCount: quota.minuteCount + 1,
          dailyCount: quota.dailyCount + 1,
          dailyQuota: isFinite(quota.dailyQuota) ? quota.dailyQuota : null,
          minuteLimit: quota.minuteLimit
        }
      }
    },
    200,
    cors
  )
})

// -----------------------------------------------------------------------------
// Body parsing + validation
// -----------------------------------------------------------------------------

async function parseBody(req: Request): Promise<{ topic: string; options: GenerateOptions }> {
  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    throw new Error('요청 본문을 JSON 으로 해석할 수 없습니다.')
  }
  if (!isObject(raw)) throw new Error('요청 본문이 객체가 아닙니다.')

  const body = raw as RequestBody
  if (typeof body.topic !== 'string' || body.topic.trim().length === 0) {
    throw new Error('topic 은 비어있지 않은 문자열이어야 합니다.')
  }
  const topic = body.topic.trim()
  if (topic.length > 500) {
    throw new Error('topic 은 500자 이하여야 합니다.')
  }

  const options = parseOptions(body.options)
  return { topic, options }
}

function parseOptions(raw: unknown): GenerateOptions {
  if (!isObject(raw)) return {}
  const o = raw as Record<string, unknown>
  const opts: GenerateOptions = {}

  if (o.originality === 'preserve' || o.originality === 'remix' || o.originality === 'creative') {
    opts.originality = o.originality
  }
  if (o.length === 'short' || o.length === 'normal' || o.length === 'long') {
    opts.length = o.length
  }
  if (typeof o.extraNotes === 'string') {
    opts.extraNotes = o.extraNotes.slice(0, 500)
  }
  if (Array.isArray(o.learningRefs)) {
    opts.learningRefs = o.learningRefs
      .filter((r: unknown): r is string => typeof r === 'string')
      .slice(0, 3)
      .map((r: string) => r.slice(0, 500))
  }
  if (o.language === 'ko' || o.language === 'en' || o.language === 'ja') {
    opts.language = o.language
  }

  return opts
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

// -----------------------------------------------------------------------------
// Response helpers
// -----------------------------------------------------------------------------

function jsonResponse(body: unknown, status: number, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors }
  })
}

function errorResponse(
  code: string,
  message: string,
  status: number,
  cors: Record<string, string>
): Response {
  return jsonResponse({ ok: false, error: { code, message } }, status, cors)
}
