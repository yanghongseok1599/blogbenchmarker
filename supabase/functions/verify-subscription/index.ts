// supabase/functions/verify-subscription/index.ts
// 결제 검증 Edge Function (Phase 8.2).
//
// 두 가지 진입 모드:
//
//  (A) 클라이언트 주도 확정:
//      POST /functions/v1/verify-subscription
//      Authorization: Bearer <supabase_jwt>           ← JWT 필수
//      Body: { mode: "confirm", gateway, payment_id, plan, orderId?, amount? }
//      흐름: JWT 검증 → PG API 호출 → 금액 일치 확인 → subscriptions UPSERT
//
//  (B) PG webhook:
//      POST /functions/v1/verify-subscription
//      Authorization 헤더 없음, 대신 x-signature / x-portone-signature
//      Body: PG 사 정의 payload
//      흐름: HMAC 검증 → payment_id 기반 조회 → subscriptions UPDATE (status 전이)
//
// 보안 핵심:
//   - TOSS_SECRET_KEY, PORTONE_API_SECRET, *_WEBHOOK_SECRET, SUPABASE_SERVICE_ROLE_KEY 는
//     Deno.env 에서만 읽는다 (하드코딩/로깅 금지).
//   - Webhook 은 JWT 없음 → 반드시 HMAC 서명 검증으로 대체.
//   - service_role 사용은 subscriptions 쓰기에 한정 (일반 사용자는 SELECT 만).
//   - 중복 webhook: UNIQUE(gateway, payment_id) + UPSERT(onConflict) 로 흡수.
//   - 금액 위변조: 클라이언트가 보낸 amount 를 **검증 기준으로 쓰지 않고**, PG API 가 돌려준 실제 금액을 DB 저장값과 비교.

import { serve } from 'std/http/server'
import { createClient, SupabaseClient } from '@supabase/supabase-js'

import { authenticate, authErrorResponse } from '../_shared/auth.ts'
import {
  verifyHmacSignature,
  DEFAULT_SIGNATURE_HEADER,
} from '../_shared/webhook-sig.ts'
import {
  confirmPayment as tossConfirmPayment,
  fetchPayment as tossFetchPayment,
  isPaidSuccessfully as tossPaid,
  isRefunded as tossRefunded,
  TossError,
} from '../_shared/toss.ts'
import {
  getPayment as portoneGetPayment,
  isPaidSuccessfully as portonePaid,
  isRefunded as portoneRefunded,
  PortoneError,
} from '../_shared/portone.ts'

// ─────────────────────────────────────────────────────────────
// 상수
// ─────────────────────────────────────────────────────────────

const ALLOWED_GATEWAYS = ['toss', 'portone'] as const
type Gateway = typeof ALLOWED_GATEWAYS[number]
type Plan = 'free' | 'pro' | 'unlimited'
const ALLOWED_PLANS: readonly Plan[] = ['free', 'pro', 'unlimited']

/** 플랜별 원화 가격(원). app_settings 에서 override 가능(후속 확장). */
const PLAN_PRICES: Record<Exclude<Plan, 'free'>, number> = {
  pro: 9900,
  unlimited: 29900,
}

/** PRO 구독 기간(일) — 단순화된 기본값. 추후 요금제별 분기. */
const PRO_PERIOD_DAYS = 30

// ─────────────────────────────────────────────────────────────
// 공통 응답
// ─────────────────────────────────────────────────────────────

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  })
}

function okResponse<T>(data: T): Response {
  return jsonResponse({ ok: true, data }, 200)
}

function errorResponse(code: string, message: string, status: number, details?: unknown): Response {
  const body: Record<string, unknown> = { ok: false, error: { code, message } }
  if (details !== undefined) (body.error as any).details = details
  return jsonResponse(body, status)
}

// ─────────────────────────────────────────────────────────────
// service_role 클라이언트 (subscriptions 쓰기 전용)
// ─────────────────────────────────────────────────────────────

function serviceClient(): SupabaseClient {
  const url = Deno.env.get('SUPABASE_URL')
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !key) {
    throw new Error('server_misconfig: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 누락')
  }
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

// ─────────────────────────────────────────────────────────────
// 메인 핸들러
// ─────────────────────────────────────────────────────────────

serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204 })
  if (req.method !== 'POST') {
    return errorResponse('method_not_allowed', 'POST 요청만 허용됩니다.', 405)
  }
  if (!(req.headers.get('Content-Type') ?? '').toLowerCase().includes('application/json')) {
    return errorResponse('invalid_content_type', 'Content-Type 은 application/json 이어야 합니다.', 415)
  }

  // 원문을 한 번만 읽고 두 경로(JSON 파싱, HMAC 검증)에서 공유한다.
  const rawBody = await req.text()

  let body: any
  try {
    body = rawBody ? JSON.parse(rawBody) : {}
  } catch {
    return errorResponse('invalid_input', '요청 본문 JSON 파싱 실패', 400)
  }

  // 모드 결정:
  //   Authorization 헤더가 있으면 mode=confirm (클라이언트 주도)
  //   없거나 body.mode === 'webhook' 이면 mode=webhook (PG 주도)
  const hasBearer = (req.headers.get('Authorization') ?? '').toLowerCase().startsWith('bearer ')
  const mode: 'confirm' | 'webhook' =
    body?.mode === 'webhook' || !hasBearer ? 'webhook' : 'confirm'

  try {
    if (mode === 'confirm') {
      return await handleConfirm(req, body)
    }
    return await handleWebhook(req, rawBody, body)
  } catch (err) {
    // JWT/PG 에러 정규화
    if ((err as any)?.code && (err as any)?.status) {
      return authErrorResponse(err)
    }
    if (err instanceof TossError || err instanceof PortoneError) {
      return errorResponse(err.code || 'upstream_error', err.message, err.httpStatus || 502)
    }
    console.warn('[verify-subscription] unexpected error:', (err as Error)?.message)
    return errorResponse('internal_error', '처리 중 오류가 발생했습니다.', 500)
  }
})

// ─────────────────────────────────────────────────────────────
// (A) confirm — 클라이언트 주도 결제 확정
// ─────────────────────────────────────────────────────────────

async function handleConfirm(req: Request, body: any): Promise<Response> {
  const auth = await authenticate(req)
  const userId = auth.userId

  const gateway = sanitizeGateway(body?.gateway)
  const paymentId = String(body?.payment_id ?? '').trim()
  const plan = sanitizePlan(body?.plan)

  if (!gateway) return errorResponse('invalid_input', 'gateway 는 toss 또는 portone 이어야 합니다.', 400)
  if (!paymentId) return errorResponse('invalid_input', 'payment_id 가 필요합니다.', 400)
  if (!plan || plan === 'free') return errorResponse('invalid_input', '유효한 유료 plan 이 필요합니다.', 400)

  // PG API 호출 — 서버측 진실의 원천
  let verified: VerifiedPayment
  if (gateway === 'toss') {
    verified = await verifyToss(paymentId, body, plan)
  } else {
    verified = await verifyPortone(paymentId, plan)
  }

  if (!verified.success) {
    return errorResponse('payment_not_completed', '결제가 완료되지 않았습니다.', 402, {
      gatewayStatus: verified.status,
    })
  }

  // 금액 위변조 체크 — 클라이언트 값이 아니라 PG 응답 기준
  const expectedAmount = PLAN_PRICES[plan as Exclude<Plan, 'free'>]
  if (Number(verified.amount) !== expectedAmount) {
    return errorResponse('amount_mismatch', '결제 금액이 플랜 가격과 일치하지 않습니다.', 400, {
      expected: expectedAmount,
      actual: verified.amount,
    })
  }

  const now = new Date()
  const endsAt = new Date(now.getTime() + PRO_PERIOD_DAYS * 24 * 60 * 60 * 1000)

  // subscriptions UPSERT — UNIQUE(gateway, payment_id) 충돌 시 업데이트.
  const db = serviceClient()
  const { data, error } = await db
    .from('subscriptions')
    .upsert(
      {
        user_id: userId,
        plan,
        status: 'active',
        gateway,
        payment_id: paymentId,
        starts_at: now.toISOString(),
        ends_at: endsAt.toISOString(),
      },
      { onConflict: 'gateway,payment_id' }
    )
    .select('id, user_id, plan, status, gateway, payment_id, starts_at, ends_at')
    .single()

  if (error) {
    console.warn('[verify-subscription/confirm] subscriptions upsert 실패:', error.message)
    return errorResponse('db_error', '구독 저장 실패', 500, { message: error.message })
  }

  // profiles.plan 은 DB 트리거(migrations/007) 가 자동 동기화한다.
  return okResponse({ subscription: data })
}

// ─────────────────────────────────────────────────────────────
// (B) webhook — PG 주도 상태 전이 (환불/취소/실패)
// ─────────────────────────────────────────────────────────────

async function handleWebhook(req: Request, rawBody: string, body: any): Promise<Response> {
  const gateway = sanitizeGateway(body?.gateway ?? detectGatewayFromHeaders(req))
  if (!gateway) return errorResponse('invalid_input', 'gateway 를 식별할 수 없습니다.', 400)

  const secret =
    gateway === 'toss'
      ? Deno.env.get('TOSS_WEBHOOK_SECRET')
      : Deno.env.get('PORTONE_WEBHOOK_SECRET')

  const signatureHeader =
    gateway === 'toss'
      ? req.headers.get(DEFAULT_SIGNATURE_HEADER) ?? req.headers.get('x-toss-signature')
      : req.headers.get('x-portone-signature') ?? req.headers.get(DEFAULT_SIGNATURE_HEADER)

  const ok = await verifyHmacSignature(rawBody, signatureHeader, secret)
  if (!ok) {
    return errorResponse('invalid_signature', 'webhook 서명 검증에 실패했습니다.', 401)
  }

  // payload 에서 gateway-specific payment_id 추출
  const paymentId =
    gateway === 'toss'
      ? String(body?.paymentKey ?? body?.payment_id ?? '').trim()
      : String(body?.data?.paymentId ?? body?.paymentId ?? body?.payment_id ?? '').trim()

  if (!paymentId) {
    return errorResponse('invalid_input', 'payment_id 를 찾을 수 없습니다.', 400)
  }

  // 해당 구독을 subscriptions 에서 찾아 상태 갱신
  const db = serviceClient()
  const { data: row, error: findErr } = await db
    .from('subscriptions')
    .select('id, status, gateway, payment_id, user_id')
    .eq('gateway', gateway)
    .eq('payment_id', paymentId)
    .maybeSingle()

  if (findErr) {
    return errorResponse('db_error', '구독 조회 실패', 500, { message: findErr.message })
  }
  if (!row) {
    // 아직 confirm 을 거치지 않았거나 PG 의 선행 이벤트 — webhook 은 멱등해야 하므로 204 로 ack.
    return jsonResponse({ ok: true, data: { received: true, matched: false } }, 200)
  }

  // 실제 PG 상태 재조회(위변조 원천 방지)
  let refunded = false
  let stillPaid = true
  if (gateway === 'toss') {
    const p = await tossFetchPayment(paymentId)
    refunded = tossRefunded(p)
    stillPaid = tossPaid(p) && !refunded
  } else {
    const p = await portoneGetPayment(paymentId)
    refunded = portoneRefunded(p)
    stillPaid = portonePaid(p) && !refunded
  }

  const nextStatus = refunded ? 'refunded' : stillPaid ? 'active' : 'expired'
  if (nextStatus === row.status) {
    return okResponse({ received: true, matched: true, changed: false })
  }

  const patch: Record<string, unknown> = { status: nextStatus }
  if (nextStatus === 'refunded' || nextStatus === 'expired') {
    patch.ends_at = new Date().toISOString()
  }

  const { error: updErr } = await db.from('subscriptions').update(patch).eq('id', row.id)
  if (updErr) {
    return errorResponse('db_error', '구독 갱신 실패', 500, { message: updErr.message })
  }

  // profiles.plan 복귀는 migrations/007 의 AFTER UPDATE 트리거가 자동 처리.
  return okResponse({ received: true, matched: true, changed: true, status: nextStatus })
}

// ─────────────────────────────────────────────────────────────
// 헬퍼
// ─────────────────────────────────────────────────────────────

type VerifiedPayment = {
  success: boolean
  status: string
  amount: number
  raw: unknown
}

async function verifyToss(paymentId: string, body: any, _plan: Plan): Promise<VerifiedPayment> {
  // confirm 엔드포인트를 쓰려면 orderId + amount 필요.
  // 양쪽 모두 있으면 confirm(멱등 에러는 무시 처리), 없으면 fetch 로 상태 조회.
  const orderId = typeof body?.orderId === 'string' ? body.orderId : ''
  const amount = Number(body?.amount)

  let p
  if (orderId && Number.isFinite(amount) && amount > 0) {
    try {
      p = await tossConfirmPayment({ paymentKey: paymentId, orderId, amount })
    } catch (err) {
      if (err instanceof TossError && /already/i.test(err.message)) {
        // 이미 승인된 결제 — fetch 로 폴백
        p = await tossFetchPayment(paymentId)
      } else {
        throw err
      }
    }
  } else {
    p = await tossFetchPayment(paymentId)
  }

  return {
    success: tossPaid(p),
    status: p.status,
    amount: Number(p.totalAmount ?? 0),
    raw: p,
  }
}

async function verifyPortone(paymentId: string, _plan: Plan): Promise<VerifiedPayment> {
  const p = await portoneGetPayment(paymentId)
  return {
    success: portonePaid(p),
    status: p.status,
    amount: Number(p.amount?.paid ?? p.amount?.total ?? 0),
    raw: p,
  }
}

function sanitizeGateway(v: unknown): Gateway | null {
  return ALLOWED_GATEWAYS.includes(v as Gateway) ? (v as Gateway) : null
}

function sanitizePlan(v: unknown): Plan | null {
  return ALLOWED_PLANS.includes(v as Plan) ? (v as Plan) : null
}

function detectGatewayFromHeaders(req: Request): Gateway | null {
  if (req.headers.get('x-portone-signature')) return 'portone'
  if (req.headers.get('x-toss-signature')) return 'toss'
  return null
}
