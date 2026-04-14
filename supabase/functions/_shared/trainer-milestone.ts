// supabase/functions/_shared/trainer-milestone.ts
// 트레이너 마일스톤(TM) 결제 게이트웨이 통합 헬퍼.
//
// TM 은 자체 호스팅 결제창이므로, BlogBenchmarker 측은 두 가지 경계만 책임진다:
//   1) checkout.html 에서 TM 결제 URL 로 사용자 리다이렉트 (orderId 동봉)
//   2) TM 이 결제 완료/환불 시 우리 verify-subscription 으로 webhook POST
//
// TM 에게 요구할 webhook 스펙 (TM 측 구현자에게 전달):
//   POST {SUPABASE_URL}/functions/v1/verify-subscription
//   Headers:
//     Content-Type: application/json
//     X-Signature: HMAC-SHA256(WEBHOOK_SECRET, raw_body) hex
//   Body:
//     {
//       "gateway": "trainer_milestone",
//       "payment_id": "TM 내부 결제 식별자 (재시도 idempotent key)",
//       "user_id": "BlogBenchmarker profiles.id (uuid). checkout 시 전달된 값 그대로",
//       "plan": "pro" | "unlimited",
//       "amount": 9900,
//       "status": "paid" | "refunded" | "cancelled",
//       "paid_at": "ISO8601 타임스탬프",
//       "ends_at": "ISO8601 (정기 구독 만료일, 평생결제는 null)"
//     }
//
// 보안:
//   - X-Signature 검증 실패 시 401 즉시 반환 (webhook-sig.ts 사용).
//   - status='paid' 가 아니면 plan 혜택 부여 금지.
//   - 금액 검증은 호출자가 PLAN_PRICES 와 비교해야 함.

export type TmStatus = 'paid' | 'refunded' | 'cancelled'

export interface TmWebhookPayload {
  gateway: 'trainer_milestone'
  payment_id: string
  user_id: string
  plan: 'pro' | 'unlimited'
  amount: number
  status: TmStatus
  paid_at: string
  ends_at?: string | null
}

const REQUIRED_FIELDS: (keyof TmWebhookPayload)[] = [
  'gateway',
  'payment_id',
  'user_id',
  'plan',
  'amount',
  'status',
  'paid_at',
]

/**
 * TM webhook payload 형식 검증.
 * 누락/형식 오류 시 throw — 호출자가 400 응답 변환.
 */
export function parseTmWebhook(body: unknown): TmWebhookPayload {
  if (!body || typeof body !== 'object') {
    throw new Error('payload_must_be_object')
  }
  const obj = body as Record<string, unknown>

  for (const f of REQUIRED_FIELDS) {
    if (obj[f] === undefined || obj[f] === null || obj[f] === '') {
      throw new Error(`missing_field:${f}`)
    }
  }
  if (obj.gateway !== 'trainer_milestone') {
    throw new Error('gateway_mismatch')
  }
  if (!['pro', 'unlimited'].includes(obj.plan as string)) {
    throw new Error(`invalid_plan:${obj.plan}`)
  }
  if (!['paid', 'refunded', 'cancelled'].includes(obj.status as string)) {
    throw new Error(`invalid_status:${obj.status}`)
  }
  if (typeof obj.amount !== 'number' || obj.amount < 0) {
    throw new Error('invalid_amount')
  }
  if (typeof obj.user_id !== 'string' || !/^[0-9a-f-]{36}$/i.test(obj.user_id)) {
    throw new Error('invalid_user_id')
  }
  if (typeof obj.payment_id !== 'string' || obj.payment_id.length < 4) {
    throw new Error('invalid_payment_id')
  }

  return {
    gateway: 'trainer_milestone',
    payment_id: String(obj.payment_id),
    user_id: String(obj.user_id),
    plan: obj.plan as 'pro' | 'unlimited',
    amount: obj.amount as number,
    status: obj.status as TmStatus,
    paid_at: String(obj.paid_at),
    ends_at: obj.ends_at === null || obj.ends_at === undefined
      ? null
      : String(obj.ends_at),
  }
}

/**
 * TM status → subscriptions.status 매핑.
 */
export function mapTmStatusToSubscription(s: TmStatus): 'active' | 'refunded' | 'cancelled' {
  switch (s) {
    case 'paid':
      return 'active'
    case 'refunded':
      return 'refunded'
    case 'cancelled':
      return 'cancelled'
  }
}
