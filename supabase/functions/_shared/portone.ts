// supabase/functions/_shared/portone.ts
// 포트원(PortOne) V2 API 래퍼 — 결제 확인 전용.
// 문서: https://developers.portone.io/api/rest-v2
//
// 인증: Authorization: PortOne {API_SECRET}
// 환경변수 PORTONE_API_SECRET 는 Edge Function 에서만 읽는다.
// 본 래퍼는 에러를 throw. 호출 측에서 상위 에러 봉투로 치환한다.

const PORTONE_BASE = 'https://api.portone.io'

export type PortoneStatus =
  | 'READY'
  | 'PENDING'
  | 'VIRTUAL_ACCOUNT_ISSUED'
  | 'PAID'
  | 'FAILED'
  | 'PARTIAL_CANCELLED'
  | 'CANCELLED'

export type PortonePayment = {
  id: string
  status: PortoneStatus
  merchantId: string
  storeId: string
  channel: unknown
  orderName: string
  amount: { total: number; paid?: number; cancelled?: number }
  currency: string
  paidAt?: string
  [key: string]: unknown
}

export class PortoneError extends Error {
  readonly code: string
  readonly httpStatus: number
  constructor(code: string, message: string, httpStatus: number) {
    super(message)
    this.name = 'PortoneError'
    this.code = code
    this.httpStatus = httpStatus
  }
}

function getApiSecret(): string {
  const key = Deno.env.get('PORTONE_API_SECRET')
  if (!key) {
    throw new PortoneError(
      'server_misconfig',
      'PORTONE_API_SECRET 가 설정되지 않았습니다.',
      500
    )
  }
  return key
}

async function callPortone<T>(path: string, init: RequestInit): Promise<T> {
  const url = `${PORTONE_BASE}${path}`
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `PortOne ${getApiSecret()}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  })
  const text = await res.text()
  let json: any = null
  try { json = text ? JSON.parse(text) : null } catch { /* not JSON */ }

  if (!res.ok) {
    const code = json?.type || json?.code || 'upstream_error'
    const message = json?.message || `PortOne ${res.status}`
    throw new PortoneError(code, message, res.status)
  }
  return json as T
}

/**
 * 결제 ID 로 단건 조회.
 * @param paymentId 포트원 결제 고유 ID
 */
export function getPayment(paymentId: string): Promise<PortonePayment> {
  if (!paymentId) {
    throw new PortoneError('invalid_input', 'paymentId 가 필요합니다.', 400)
  }
  const encoded = encodeURIComponent(paymentId)
  return callPortone<PortonePayment>(`/payments/${encoded}`, { method: 'GET' })
}

/**
 * 결제가 "유효하게 완료되었는가" 를 boolean 으로 요약.
 * status === 'PAID' 이고 금액이 0 초과.
 */
export function isPaidSuccessfully(p: PortonePayment): boolean {
  const paid = Number(p.amount?.paid ?? p.amount?.total ?? 0)
  return p.status === 'PAID' && paid > 0
}

/**
 * 환불/취소 상태 요약.
 */
export function isRefunded(p: PortonePayment): boolean {
  return p.status === 'CANCELLED' || p.status === 'PARTIAL_CANCELLED'
}
