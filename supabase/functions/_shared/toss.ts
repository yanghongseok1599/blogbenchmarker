// supabase/functions/_shared/toss.ts
// 토스페이먼츠 API 래퍼 — 결제 확인 전용.
// 문서: https://docs.tosspayments.com/reference
//
// 인증: Basic Auth.  Authorization: Basic base64("{SECRET_KEY}:")  (콜론 포함, 비밀번호 비움)
// 환경변수 TOSS_SECRET_KEY 는 Edge Function 에서만 읽는다 (절대 클라이언트 노출 금지).
//
// 사용 엔드포인트:
//   GET  /v1/payments/{paymentKey}                        — 결제 조회 (verify 용도)
//   POST /v1/payments/confirm  { paymentKey, orderId, amount } — 결제 승인 (클라이언트 requestPayment 이후)
//
// 본 래퍼는 에러를 throw 로 처리. 호출 측에서 try/catch 후 상위 에러 봉투로 치환한다.

const TOSS_BASE = 'https://api.tosspayments.com'

export type TossPaymentStatus =
  | 'READY'
  | 'IN_PROGRESS'
  | 'WAITING_FOR_DEPOSIT'
  | 'DONE'
  | 'CANCELED'
  | 'PARTIAL_CANCELED'
  | 'ABORTED'
  | 'EXPIRED'

export type TossPayment = {
  paymentKey: string
  orderId: string
  orderName: string
  status: TossPaymentStatus
  totalAmount: number
  balanceAmount: number
  approvedAt: string | null
  method: string | null
  currency: string
  [key: string]: unknown
}

export class TossError extends Error {
  readonly code: string
  readonly httpStatus: number
  constructor(code: string, message: string, httpStatus: number) {
    super(message)
    this.name = 'TossError'
    this.code = code
    this.httpStatus = httpStatus
  }
}

function getSecretKey(): string {
  const key = Deno.env.get('TOSS_SECRET_KEY')
  if (!key) {
    throw new TossError('server_misconfig', 'TOSS_SECRET_KEY 가 설정되지 않았습니다.', 500)
  }
  return key
}

function authHeader(): string {
  const secret = getSecretKey()
  // Basic base64("{secretKey}:") — 비밀번호는 비움(콜론만)
  // @ts-ignore Deno 환경에 btoa 존재
  const encoded = btoa(`${secret}:`)
  return `Basic ${encoded}`
}

async function callToss<T>(path: string, init: RequestInit): Promise<T> {
  const url = `${TOSS_BASE}${path}`
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: authHeader(),
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  })
  const text = await res.text()
  let json: any = null
  try { json = text ? JSON.parse(text) : null } catch { /* not JSON */ }

  if (!res.ok) {
    const code = json?.code || 'upstream_error'
    const message = json?.message || `TossPayments ${res.status}`
    throw new TossError(code, message, res.status)
  }
  return json as T
}

/**
 * paymentKey 로 결제 상세 조회 (verify 전용).
 * @param paymentKey 토스가 발급한 결제 고유 식별자
 */
export function fetchPayment(paymentKey: string): Promise<TossPayment> {
  if (!paymentKey) throw new TossError('invalid_input', 'paymentKey 가 필요합니다.', 400)
  const encoded = encodeURIComponent(paymentKey)
  return callToss<TossPayment>(`/v1/payments/${encoded}`, { method: 'GET' })
}

/**
 * 결제 승인 (클라이언트 결제창 → successUrl 로 넘어올 때 paymentKey/orderId/amount 를 검증·확정).
 * 이미 확정된 paymentKey 로 재호출하면 토스가 idempotent 에러를 반환한다.
 */
export function confirmPayment(params: {
  paymentKey: string
  orderId: string
  amount: number
}): Promise<TossPayment> {
  const { paymentKey, orderId, amount } = params
  if (!paymentKey || !orderId || !Number.isFinite(amount) || amount <= 0) {
    throw new TossError('invalid_input', 'paymentKey / orderId / amount 가 유효하지 않습니다.', 400)
  }
  return callToss<TossPayment>('/v1/payments/confirm', {
    method: 'POST',
    body: JSON.stringify({ paymentKey, orderId, amount }),
  })
}

/**
 * 결제가 "유효하게 승인되었는가" 를 boolean 으로 요약.
 * DONE + 잔액 > 0 인 경우만 true.
 */
export function isPaidSuccessfully(payment: TossPayment): boolean {
  return payment.status === 'DONE' && Number(payment.balanceAmount) > 0
}

/**
 * 환불/취소 상태 요약.
 */
export function isRefunded(payment: TossPayment): boolean {
  return payment.status === 'CANCELED' || payment.status === 'PARTIAL_CANCELED'
}
