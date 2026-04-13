// background/handlers/generate-handler.js
// Phase 5.2: AI 글 생성 메시지 핸들러.
//
// 액션: generate.content (및 호환용 generateContent)
// 흐름:
//   1) 세션 유효성 확인 (JWT 없이 Edge Function 호출 불가)
//   2) payload 검증 + 기본값 주입
//   3) supabase.functions.invoke('generate-content', { body }) 호출
//      (SDK 가 자동으로 Authorization: Bearer <access_token> 첨부)
//   4) 결과 봉투(ok/data | ok/error)를 그대로 UI 로 전달
//
// Edge Function 계약: _workspace/edge_function_contracts.md §1

import { supabase, getSession } from '../../lib/supabase-client.js'
import { getLearningsByIds } from '../../lib/repositories/learning-repo.js'
import {
  buildLearningRefs,
  extractStyleProfile,
} from '../../lib/analyzers/learning-context.js'

const FUNCTION_NAME = 'generate-content'

/** 입력 상한 (Edge Function 과 동일 기준) */
const LIMITS = Object.freeze({
  TOPIC_MAX: 500,
  EXTRA_NOTES_MAX: 500,
  LEARNING_REF_MAX: 500,
  LEARNING_REFS_MAX_COUNT: 3,
})

/** 허용되는 enum 값 */
const ALLOWED = Object.freeze({
  ORIGINALITY: ['preserve', 'remix', 'creative'],
  LENGTH: ['short', 'normal', 'long'],
  LANGUAGE: ['ko', 'en', 'ja'],
})

/**
 * @typedef {Object} GenerateContentPayload
 * @property {string} topic
 * @property {Object} [options]
 * @property {'preserve'|'remix'|'creative'} [options.originality]
 * @property {'short'|'normal'|'long'} [options.length]
 * @property {string} [options.extraNotes]
 * @property {string[]} [options.learningRefs]
 * @property {'ko'|'en'|'ja'} [options.language]
 */

/**
 * payload 를 Edge Function 이 기대하는 shape 으로 정규화한다.
 * 범위 밖 값은 조용히 기본값으로 치환(서버가 최종 검증).
 * @param {any} raw
 * @returns {GenerateContentPayload}
 */
function normalizePayload(raw) {
  const topic = String(raw?.topic ?? '').trim().slice(0, LIMITS.TOPIC_MAX)
  if (!topic) throw new Error('주제를 입력해 주세요.')

  const opts = raw?.options ?? {}

  const originality = ALLOWED.ORIGINALITY.includes(opts.originality)
    ? opts.originality
    : 'remix'

  const length = ALLOWED.LENGTH.includes(opts.length)
    ? opts.length
    : 'normal'

  const extraNotes =
    typeof opts.extraNotes === 'string'
      ? opts.extraNotes.trim().slice(0, LIMITS.EXTRA_NOTES_MAX)
      : undefined

  /** @type {string[] | undefined} */
  let learningRefs
  if (Array.isArray(opts.learningRefs)) {
    learningRefs = opts.learningRefs
      .filter((s) => typeof s === 'string')
      .slice(0, LIMITS.LEARNING_REFS_MAX_COUNT)
      .map((s) => s.trim().slice(0, LIMITS.LEARNING_REF_MAX))
      .filter((s) => s.length > 0)
    if (learningRefs.length === 0) learningRefs = undefined
  }

  const language = ALLOWED.LANGUAGE.includes(opts.language) ? opts.language : undefined

  const options = {}
  options.originality = originality
  options.length = length
  if (extraNotes) options.extraNotes = extraNotes
  if (learningRefs) options.learningRefs = learningRefs
  if (language) options.language = language

  return { topic, options }
}

/**
 * Edge Function 에러 봉투를 UI 친화 메시지로 치환.
 * 계약(§1.3)의 code 를 소스로 사용.
 * @param {{ code?: string, message?: string, details?: unknown } | undefined} err
 */
function mapEdgeError(err) {
  const code = err?.code || ''
  const fallback = err?.message || '생성에 실패했습니다. 잠시 후 다시 시도해 주세요.'
  const MAP = {
    invalid_input:          err?.message || '입력값을 확인해 주세요.',
    missing_authorization:  '로그인이 필요합니다.',
    invalid_token:          '인증이 만료되었습니다. 다시 로그인해 주세요.',
    profile_not_found:      '프로필 정보를 찾지 못했습니다. 잠시 후 다시 시도해 주세요.',
    rate_limit:             '너무 빠르게 요청하고 있습니다. 1분당 10회까지 가능합니다.',
    quota_exceeded:         '일일 사용량을 초과했습니다. 플랜 업그레이드를 고려해 주세요.',
    invalid_key:            'AI 기능 설정에 문제가 있습니다. 관리자에게 문의하세요.',
    missing_key:            'AI 기능이 현재 설정되어 있지 않습니다. 관리자에게 문의하세요.',
    upstream_error:         'AI 서버에서 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.',
    invalid_response:       'AI 서버 응답을 해석할 수 없습니다.',
    server_misconfig:       '서버 설정 오류입니다. 관리자에게 문의해 주세요.',
  }
  return { code: code || 'unknown', message: MAP[code] || fallback, details: err?.details }
}

/**
 * generate-content 호출.
 * @param {GenerateContentPayload} payload
 */
async function invokeEdge(payload) {
  // supabase.functions.invoke 는 성공/에러 모두 { data, error } 를 반환한다.
  // 네트워크 레벨 에러는 error 에, HTTP 200 이 아닌 응답의 body 는 data 에 담긴다(버전별 차이 있음).
  const { data, error } = await supabase.functions.invoke(FUNCTION_NAME, {
    body: payload,
  })

  if (error) {
    // Edge Function 이 non-2xx 를 반환한 경우 context.response 로 본문 접근 가능(SDK 버전별 차이).
    // 가능하면 본문의 봉투 구조를 우선 사용, 아니면 원문 메시지 사용.
    const bodyErr = error?.context?.body?.error ?? null
    const mapped = mapEdgeError(bodyErr || { code: 'upstream_error', message: error.message })
    throw Object.assign(new Error(mapped.message), { code: mapped.code, details: mapped.details })
  }

  if (!data || data.ok !== true) {
    const mapped = mapEdgeError(data?.error)
    throw Object.assign(new Error(mapped.message), { code: mapped.code, details: mapped.details })
  }

  return data.data
}

export const generateHandler = {
  /**
   * AI 글 생성.
   * @param {GenerateContentPayload} payload
   * @returns {Promise<import('./generate-handler.js').GenerateContentResult>}
   */
  async content(payload) {
    // 1) 세션 확인
    const session = await getSession()
    if (!session?.access_token) {
      throw new Error('로그인이 필요합니다.')
    }
    const userId = session?.user?.id

    // 2) 입력 정규화 + 검증
    const normalized = normalizePayload(payload)

    // 2-1) 학습 컨텍스트 적용 (useLearning + learningIds)
    //   - 호출자가 직접 learningRefs 를 넘긴 경우는 그대로 둔다(우선순위 유지).
    //   - 그렇지 않으면 selectedIds → DB 조회 → buildLearningRefs 로 옵션에 주입.
    //   - styleProfile 메타는 Edge Function 의 옵션 영역으로 같이 전달하지는 않는다
    //     (계약 §1.1 에 styleProfile 키 미정의 — UI 가이드/디버깅용으로만 반환에 동봉).
    const learningInjection = await maybeBuildLearningContext(payload, userId, normalized)
    if (learningInjection?.refs && !normalized.options.learningRefs) {
      normalized.options.learningRefs = learningInjection.refs
    }

    // 3) Edge Function 호출 → data 반환
    const data = await invokeEdge(normalized)

    // 4) 호출 측이 사용하기 쉽게 최소한의 shape 보장.
    //    필수 필드: content (string), quota, tokensUsed.
    //    learningContext: useLearning 사용 시 적용된 styleProfile/refs 메타(UI 표시·디버깅용).
    return {
      content: typeof data?.content === 'string' ? data.content : '',
      tokensUsed: Number(data?.tokensUsed) || 0,
      model: data?.model || 'gemini-2.5-flash',
      finishReason: data?.finishReason || null,
      quota: data?.quota || null,
      learningContext: learningInjection?.summary ?? null,
    }
  },
}

/**
 * payload.options.useLearning / learningIds 를 처리해 Edge Function 호출에 주입할
 * learningRefs 와, 응답에 동봉할 styleProfile 요약을 준비한다.
 * 학습이 비활성이거나 ID 0개면 null 반환.
 *
 * @param {any} rawPayload 원본 payload (정규화 전)
 * @param {string | undefined} userId
 * @param {GenerateContentPayload} normalized 정규화된 payload (learningRefs 주입 대상)
 * @returns {Promise<null | { refs: string[], summary: { sampleCount: number, topKeywords: string[], avgSentenceLen: number } }>}
 */
async function maybeBuildLearningContext(rawPayload, userId, normalized) {
  const opts = rawPayload?.options ?? {}
  const useLearning = opts.useLearning === true
  const ids = Array.isArray(opts.learningIds)
    ? opts.learningIds.filter((v) => typeof v === 'string' && v).slice(0, LIMITS.LEARNING_REFS_MAX_COUNT)
    : []

  if (!useLearning && ids.length === 0) return null
  if (!userId) return null
  if (normalized.options.learningRefs) return null // 호출자가 명시 → 우선

  let learnings
  try {
    learnings = await getLearningsByIds(userId, ids)
  } catch (e) {
    console.warn('[generate-handler] 학습 데이터 조회 실패:', e?.message)
    return null
  }
  if (!learnings || learnings.length === 0) return null

  const refs = buildLearningRefs(learnings)
  const profile = extractStyleProfile(learnings).styleProfile
  return {
    refs,
    summary: {
      sampleCount: profile.sampleCount,
      topKeywords: profile.topKeywords,
      avgSentenceLen: profile.avgSentenceLen,
    },
  }
}

/**
 * @typedef {Object} GenerateContentResult
 * @property {string} content
 * @property {number} tokensUsed
 * @property {string} model
 * @property {string | null} finishReason
 * @property {{ minuteCount: number, dailyCount: number, dailyQuota: number|null, minuteLimit: number } | null} quota
 */
