// supabase/functions/_shared/webhook-sig.ts
// HMAC webhook 서명 검증 유틸.
//
// 용도: 결제 PG 사가 보내는 webhook 본문의 위변조 여부를 확인한다.
// 서명 알고리즘: HMAC-SHA256 (토스/포트원 모두 해당 계열 지원).
// 비교는 반드시 **timing-safe** 방식으로 수행 (timing attack 방어).
//
// 환경변수:
//   TOSS_WEBHOOK_SECRET    — 토스페이먼츠 콘솔에서 발급
//   PORTONE_WEBHOOK_SECRET — 포트원 콘솔에서 발급
// secret 은 Edge Function 에서만 읽는다 (Deno.env.get). 확장 클라이언트에는 절대 노출 금지.

/** 서명 헤더 이름(기본값) — 실제 값은 서비스별로 다르므로 호출 측이 override 가능. */
export const DEFAULT_SIGNATURE_HEADER = 'x-signature'

export type VerifyOptions = {
  /** hex | base64. 기본: hex */
  encoding?: 'hex' | 'base64'
  /** 기본: SHA-256 */
  algorithm?: 'SHA-256' | 'SHA-1' | 'SHA-512'
}

/**
 * 타이밍 세이프 비교.
 * 길이가 달라도 일정 시간을 소비하도록 작성.
 */
function timingSafeEqual(a: string, b: string): boolean {
  const la = a.length
  const lb = b.length
  const n = Math.max(la, lb)
  let diff = la ^ lb
  for (let i = 0; i < n; i++) {
    const ca = i < la ? a.charCodeAt(i) : 0
    const cb = i < lb ? b.charCodeAt(i) : 0
    diff |= ca ^ cb
  }
  return diff === 0
}

function toHex(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let s = ''
  for (let i = 0; i < bytes.length; i++) {
    const h = bytes[i].toString(16)
    s += h.length === 1 ? '0' + h : h
  }
  return s
}

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let s = ''
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i])
  // @ts-ignore Deno 환경에 btoa 존재
  return btoa(s)
}

/**
 * HMAC 서명 계산.
 * @param body 요청 원문(raw text) — JSON.stringify 된 client 값이 아니라 **서버에서 받은 원문**.
 * @param secret webhook-secret 환경변수 값
 */
export async function computeSignature(
  body: string,
  secret: string,
  options: VerifyOptions = {}
): Promise<string> {
  const encoding = options.encoding ?? 'hex'
  const algorithm = options.algorithm ?? 'SHA-256'
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: algorithm },
    false,
    ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(body))
  return encoding === 'base64' ? toBase64(sig) : toHex(sig)
}

/**
 * 서명 검증. expected 와 실제 계산값을 timing-safe 비교.
 * @param body 원문
 * @param provided 헤더에서 읽은 서명값
 * @param secret env 에서 읽은 secret
 */
export async function verifyHmacSignature(
  body: string,
  provided: string | null,
  secret: string | undefined,
  options: VerifyOptions = {}
): Promise<boolean> {
  if (!secret) return false
  if (!provided) return false

  // 일부 PG사는 "sha256=HEX" prefix 를 붙인다. 양쪽 모두 허용.
  const cleaned = provided.replace(/^sha256=/i, '').trim()
  if (!cleaned) return false

  try {
    const expected = await computeSignature(body, secret, options)
    // hex/base64 혼용 환경 대비: 대소문자 무시 비교 (hex 는 대문자/소문자 모두 허용)
    return timingSafeEqual(
      options.encoding === 'base64' ? expected : expected.toLowerCase(),
      options.encoding === 'base64' ? cleaned : cleaned.toLowerCase()
    )
  } catch {
    return false
  }
}
