// supabase/functions/generate-content/cors.ts
// CORS 헬퍼 — Chrome Extension(chrome-extension://<id>) 에서 호출 가능하도록 설정.
//
// 운영 시:
//   - ALLOW_ORIGIN 를 특정 확장 ID 로 좁히려면 ALLOWED_EXTENSION_IDS secret 사용.
//   - 개발/초기 배포 단계는 '*' 허용 + Authorization 헤더 검증으로 실제 보안은 JWT 에서 담보.
//
// 참조: .claude/skills/supabase-migration-rules §4-6

const BASE_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age':       '86400'
}

/**
 * 요청에 맞는 CORS 헤더를 반환.
 * ALLOWED_EXTENSION_IDS (콤마 구분) secret 이 설정되어 있으면
 * Origin 을 화이트리스트와 대조해 일치 시에만 origin 을 반영한다.
 */
export function corsHeaders(req: Request): Record<string, string> {
  const allowedIds = (Deno.env.get('ALLOWED_EXTENSION_IDS') ?? '').trim()
  if (!allowedIds) {
    return { ...BASE_HEADERS }
  }

  const origin = req.headers.get('Origin') ?? ''
  const allowedOrigins = allowedIds
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
    .map(id => `chrome-extension://${id}`)

  if (allowedOrigins.includes(origin)) {
    return { ...BASE_HEADERS, 'Access-Control-Allow-Origin': origin, 'Vary': 'Origin' }
  }
  // 화이트리스트가 있는데 매치되지 않으면 null origin(사실상 차단).
  return { ...BASE_HEADERS, 'Access-Control-Allow-Origin': 'null', 'Vary': 'Origin' }
}

/**
 * OPTIONS preflight 응답.
 */
export function handleOptions(req: Request): Response {
  return new Response('ok', { status: 200, headers: corsHeaders(req) })
}
