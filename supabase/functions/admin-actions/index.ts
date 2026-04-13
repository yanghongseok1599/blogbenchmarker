// supabase/functions/admin-actions/index.ts
// 관리자 전용 작업을 service_role 로 수행하는 Edge Function.
//
// 요청:  POST /functions/v1/admin-actions
//        Authorization: Bearer <supabase_jwt>
//        Content-Type:  application/json
//        Body: { action: string, params: object }
//
// 응답:  공통 envelope (edge_function_contracts §0.1).
//        성공: { ok: true, data: any }
//        실패: { ok: false, error: { code, message, details? } }
//
// 처리 순서:
//   1) OPTIONS preflight
//   2) 메서드 / Content-Type 검증
//   3) JWT 검증 + profiles 조회 (auth.ts) → 호출자가 is_admin=true 인지 재검증
//   4) action 디스패치
//   5) admin_audit_log 에 service_role 로 INSERT (실패해도 응답은 정상)
//   6) 응답 반환
//
// 보안 원칙:
//   - service_role 은 본 함수와 verify-subscription 외에는 사용 금지(supabase-migration-rules §4-2).
//   - 클라이언트는 service_role 을 절대 보유하지 않는다.
//   - 모든 액션은 감사 로그를 남긴다(실패도 metadata.error 로 기록).

import { serve } from 'https://deno.land/std@0.220.0/http/server.ts'
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { authenticate, authErrorResponse } from '../_shared/auth.ts'

// ─────────────────────────────────────────────────────────────
// CORS (generate-content/cors.ts 와 동일 정책)
// ─────────────────────────────────────────────────────────────

const BASE_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
}

function corsHeaders(req: Request): Record<string, string> {
  const allowedIds = (Deno.env.get('ALLOWED_EXTENSION_IDS') ?? '').trim()
  if (!allowedIds) return { ...BASE_HEADERS }
  const origin = req.headers.get('Origin') ?? ''
  const allowed = allowedIds
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((id) => `chrome-extension://${id}`)
  if (allowed.includes(origin)) {
    return { ...BASE_HEADERS, 'Access-Control-Allow-Origin': origin, Vary: 'Origin' }
  }
  return { ...BASE_HEADERS, 'Access-Control-Allow-Origin': 'null', Vary: 'Origin' }
}

// ─────────────────────────────────────────────────────────────
// 응답 헬퍼
// ─────────────────────────────────────────────────────────────

type ErrorCode =
  | 'method_not_allowed'
  | 'invalid_content_type'
  | 'invalid_input'
  | 'forbidden'
  | 'unknown_action'
  | 'server_misconfig'
  | 'upstream_error'

function errorResponse(
  code: ErrorCode,
  message: string,
  status: number,
  cors: Record<string, string>,
  details?: unknown,
): Response {
  return new Response(
    JSON.stringify({ ok: false, error: { code, message, details } }),
    { status, headers: { 'Content-Type': 'application/json', ...cors } },
  )
}

function okResponse(data: unknown, cors: Record<string, string>): Response {
  return new Response(
    JSON.stringify({ ok: true, data }),
    { status: 200, headers: { 'Content-Type': 'application/json', ...cors } },
  )
}

// ─────────────────────────────────────────────────────────────
// 메인 핸들러
// ─────────────────────────────────────────────────────────────

serve(async (req: Request): Promise<Response> => {
  const cors = corsHeaders(req)

  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: cors })
  }
  if (req.method !== 'POST') {
    return errorResponse('method_not_allowed', 'POST 요청만 허용됩니다.', 405, cors)
  }
  if (!(req.headers.get('Content-Type') ?? '').toLowerCase().includes('application/json')) {
    return errorResponse('invalid_content_type', 'Content-Type 은 application/json 이어야 합니다.', 415, cors)
  }

  // 1) JWT 검증 + 호출자 profile 조회
  let auth
  try {
    auth = await authenticate(req)
  } catch (e) {
    return authErrorResponse(e, cors)
  }

  // 2) 관리자 재검증 — RLS 외에 함수 레벨 게이트 (이중 방어)
  if (!auth.profile.is_admin) {
    return errorResponse('forbidden', '관리자 권한이 필요합니다.', 403, cors)
  }

  // 3) 입력 파싱
  let body: { action?: unknown; params?: unknown }
  try {
    body = await req.json()
  } catch {
    return errorResponse('invalid_input', '요청 본문이 유효한 JSON 이 아닙니다.', 400, cors)
  }
  const action = typeof body.action === 'string' ? body.action.trim() : ''
  const params = (body.params && typeof body.params === 'object') ? body.params as Record<string, unknown> : {}
  if (!action) {
    return errorResponse('invalid_input', 'action 이 필요합니다.', 400, cors)
  }

  // 4) service_role client (감사 + 권한 우회 작업 전용)
  let admin: SupabaseClient
  try {
    admin = adminClient()
  } catch (e) {
    return errorResponse('server_misconfig', (e as Error).message, 500, cors)
  }

  // 5) 디스패치
  try {
    const result = await dispatch(action, params, auth.userId, admin)
    await writeAudit(admin, {
      admin_id: auth.userId,
      action,
      target_user_id: extractTargetUserId(params),
      metadata: { params, result_summary: summarize(result) },
    })
    return okResponse(result, cors)
  } catch (err) {
    const e = err as { code?: string; message?: string; status?: number; details?: unknown }
    const code = (e?.code as ErrorCode) || 'upstream_error'
    const message = e?.message || '관리자 작업 중 오류가 발생했습니다.'
    const status = e?.status || (code === 'forbidden' ? 403 : code === 'invalid_input' ? 400 : code === 'unknown_action' ? 404 : 500)
    // 실패 감사도 남긴다 (audit 자체 실패는 무시).
    try {
      await writeAudit(admin, {
        admin_id: auth.userId,
        action,
        target_user_id: extractTargetUserId(params),
        metadata: { params, error: { code, message, details: e?.details } },
      })
    } catch (_) {
      // ignore
    }
    return errorResponse(code, message, status, cors, e?.details)
  }
})

// ─────────────────────────────────────────────────────────────
// 액션 디스패처
// ─────────────────────────────────────────────────────────────

type Plan = 'free' | 'pro' | 'unlimited'
const PLAN_VALUES: Plan[] = ['free', 'pro', 'unlimited']

async function dispatch(
  action: string,
  params: Record<string, unknown>,
  callerId: string,
  admin: SupabaseClient,
): Promise<unknown> {
  switch (action) {
    case 'user.setPlan':
      return await actionUserSetPlan(params, admin)
    case 'user.toggleAdmin':
      return await actionUserToggleAdmin(params, callerId, admin)
    case 'settings.set':
      return await actionSettingsSet(params, admin)
    case 'audit.list':
      return await actionAuditList(params, admin)
    default:
      throw httpErr('unknown_action', `알 수 없는 액션: ${action}`, 404)
  }
}

// ─────────────────────────────────────────────────────────────
// user.setPlan — 플랜 강제 변경 + subscriptions 기록
// ─────────────────────────────────────────────────────────────

async function actionUserSetPlan(params: Record<string, unknown>, admin: SupabaseClient) {
  const userId = String(params.userId ?? '').trim()
  const plan = String(params.plan ?? '').trim() as Plan
  if (!userId) throw httpErr('invalid_input', 'userId 가 필요합니다.', 400)
  if (!PLAN_VALUES.includes(plan)) throw httpErr('invalid_input', `잘못된 plan: ${plan}`, 400)

  const durationDaysRaw = Number(params.durationDays)
  const durationDays =
    Number.isFinite(durationDaysRaw) && durationDaysRaw > 0
      ? Math.min(Math.floor(durationDaysRaw), 3650)
      : null

  // 1) profiles.plan 갱신
  const { error: upErr } = await admin
    .from('profiles')
    .update({ plan })
    .eq('id', userId)
  if (upErr) throw httpErr('upstream_error', `plan 갱신 실패: ${upErr.message}`, 500)

  // 2) 무료 외 플랜이면 subscriptions 기록 (선택). free 면 active 구독 종료 처리.
  let subscription = null
  if (plan === 'free') {
    const { error: cErr } = await admin
      .from('subscriptions')
      .update({ status: 'cancelled', ends_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('status', 'active')
    if (cErr) throw httpErr('upstream_error', `구독 종료 실패: ${cErr.message}`, 500)
  } else {
    const ends_at = durationDays
      ? new Date(Date.now() + durationDays * 86400_000).toISOString()
      : null
    const { data: sub, error: sErr } = await admin
      .from('subscriptions')
      .insert({
        user_id: userId,
        plan,
        status: 'active',
        starts_at: new Date().toISOString(),
        ends_at,
        gateway: null,
        payment_id: null,
      })
      .select('id, plan, status, starts_at, ends_at')
      .single()
    if (sErr) throw httpErr('upstream_error', `구독 생성 실패: ${sErr.message}`, 500)
    subscription = sub
  }
  return { userId, plan, subscription }
}

// ─────────────────────────────────────────────────────────────
// user.toggleAdmin — is_admin 토글
// ─────────────────────────────────────────────────────────────

async function actionUserToggleAdmin(
  params: Record<string, unknown>,
  callerId: string,
  admin: SupabaseClient,
) {
  const userId = String(params.userId ?? '').trim()
  const isAdmin = !!params.isAdmin
  if (!userId) throw httpErr('invalid_input', 'userId 가 필요합니다.', 400)

  // 자기 자신의 권한 회수는 차단(마지막 관리자 잠김 위험)
  if (userId === callerId && !isAdmin) {
    throw httpErr('forbidden', '자기 자신의 관리자 권한은 회수할 수 없습니다.', 403)
  }

  const { error } = await admin
    .from('profiles')
    .update({ is_admin: isAdmin })
    .eq('id', userId)
  if (error) throw httpErr('upstream_error', `is_admin 갱신 실패: ${error.message}`, 500)
  return { userId, is_admin: isAdmin }
}

// ─────────────────────────────────────────────────────────────
// settings.set — app_settings upsert (감사 목적의 Edge 경로)
// ─────────────────────────────────────────────────────────────

async function actionSettingsSet(params: Record<string, unknown>, admin: SupabaseClient) {
  const key = String(params.key ?? '').trim()
  if (!key) throw httpErr('invalid_input', 'key 가 필요합니다.', 400)
  if (key.length > 200) throw httpErr('invalid_input', 'key 가 너무 깁니다.', 400)

  const value = params.value
  const serialized = safeJson(value)
  if (serialized === undefined) {
    throw httpErr('invalid_input', 'value 가 직렬화 가능한 JSON 이어야 합니다.', 400)
  }

  const { data, error } = await admin
    .from('app_settings')
    .upsert({ key, value: serialized, updated_at: new Date().toISOString() }, { onConflict: 'key' })
    .select('key, value, updated_at')
    .single()
  if (error) throw httpErr('upstream_error', `설정 저장 실패: ${error.message}`, 500)
  return data
}

// ─────────────────────────────────────────────────────────────
// audit.list — 감사 로그 조회 (RLS 가 admin SELECT 허용하지만 service_role 로 일관)
// ─────────────────────────────────────────────────────────────

async function actionAuditList(params: Record<string, unknown>, admin: SupabaseClient) {
  const limit = clampInt(params.limit, 50, 1, 200)
  const offset = clampInt(params.offset, 0, 0, 100_000)

  const { data, error, count } = await admin
    .from('admin_audit_log')
    .select('id, admin_id, action, target_user_id, metadata, created_at', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)
  if (error) throw httpErr('upstream_error', `감사 로그 조회 실패: ${error.message}`, 500)
  return { rows: data ?? [], total: count ?? null }
}

// ─────────────────────────────────────────────────────────────
// service_role client + 유틸
// ─────────────────────────────────────────────────────────────

function adminClient(): SupabaseClient {
  const url = Deno.env.get('SUPABASE_URL')
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !key) {
    throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 설정되어야 합니다.')
  }
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

async function writeAudit(
  admin: SupabaseClient,
  row: { admin_id: string; action: string; target_user_id: string | null; metadata: unknown },
) {
  const { error } = await admin.from('admin_audit_log').insert({
    admin_id: row.admin_id,
    action: row.action,
    target_user_id: row.target_user_id,
    metadata: row.metadata ?? {},
  })
  if (error) {
    // 응답을 막지 않는다 — audit 실패는 별도 알림 채널로 (TODO: pgaudit/Logflare).
    console.warn('[admin-actions] audit INSERT 실패:', error.message)
  }
}

function extractTargetUserId(params: Record<string, unknown>): string | null {
  const v = params?.userId
  return typeof v === 'string' && v.trim() ? v.trim() : null
}

function summarize(result: unknown): unknown {
  if (!result || typeof result !== 'object') return result
  // 큰 객체는 요약 — 응답 본문 키만 남긴다.
  return Object.keys(result as Record<string, unknown>)
}

function safeJson(value: unknown): unknown {
  try {
    return JSON.parse(JSON.stringify(value ?? null))
  } catch {
    return undefined
  }
}

function clampInt(raw: unknown, fallback: number, min: number, max: number): number {
  const n = Number(raw)
  if (!Number.isFinite(n)) return fallback
  return Math.max(min, Math.min(max, Math.floor(n)))
}

function httpErr(code: string, message: string, status: number, details?: unknown) {
  return Object.assign(new Error(message), { code, status, details })
}
