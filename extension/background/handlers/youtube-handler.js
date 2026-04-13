// extension/background/handlers/youtube-handler.js
// YouTube 변환 메시지 핸들러
//
// 트리거: chrome.runtime.sendMessage({ action: 'extractYoutube', videoUrl, options })
// 응답:   { ok, data } | { ok: false, error: { code, message, details? } }
//
// 책임:
//   1) 세션 토큰 가져오기 (Supabase SDK 가 chrome.storage.local 에서 자동 로드)
//   2) extract-youtube Edge Function 호출 (Authorization: Bearer <jwt>)
//   3) 네트워크·응답 파싱 에러를 handler 표준 에러 shape 로 변환
//
// 참고: _workspace/edge_function_contracts.md §2
//       Supabase client 는 lib/supabase-client.js 에서 공유 (Phase 1.3 산출물).

// TODO(Phase 1.3): supabase-client.js 생성 후 실 import 로 교체.
//   import { supabase } from '../../lib/supabase-client.js'
//   import { SUPABASE_URL } from '../../lib/env-config.js'

/**
 * @param {Object} params
 * @param {string} params.videoUrl
 * @param {{ targetLanguage?: 'ko'|'en'|'ja', length?: 'short'|'normal'|'long' }} [params.options]
 * @param {Object} deps — 테스트/재사용 목적 의존성 주입
 * @param {import('@supabase/supabase-js').SupabaseClient} deps.supabase
 * @param {string} deps.supabaseUrl
 * @returns {Promise<{ ok: true, data: object } | { ok: false, error: { code: string, message: string, details?: any } }>}
 */
export async function handleExtractYoutube({ videoUrl, options }, deps) {
  if (!deps?.supabase || !deps?.supabaseUrl) {
    return {
      ok: false,
      error: { code: 'server_misconfig', message: 'Supabase 클라이언트가 초기화되지 않았습니다.' }
    }
  }

  if (typeof videoUrl !== 'string' || videoUrl.trim().length === 0) {
    return {
      ok: false,
      error: { code: 'invalid_input', message: 'YouTube URL 을 입력해 주세요.' }
    }
  }

  // 세션 획득
  const { data: sessionResp, error: sessionErr } = await deps.supabase.auth.getSession()
  const accessToken = sessionResp?.session?.access_token
  if (sessionErr || !accessToken) {
    return {
      ok: false,
      error: { code: 'missing_authorization', message: '로그인이 필요합니다. 다시 로그인해 주세요.' }
    }
  }

  const endpoint = `${deps.supabaseUrl.replace(/\/$/, '')}/functions/v1/extract-youtube`

  let response
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        videoUrl: videoUrl.trim(),
        options: sanitizeOptions(options)
      })
    })
  } catch {
    return {
      ok: false,
      error: { code: 'network_error', message: '네트워크 연결을 확인해 주세요.' }
    }
  }

  let payload
  try {
    payload = await response.json()
  } catch {
    return {
      ok: false,
      error: { code: 'invalid_response', message: '서버 응답을 해석할 수 없습니다.' }
    }
  }

  // Edge Function 응답은 이미 { ok, data } / { ok: false, error } shape
  if (payload && typeof payload === 'object' && 'ok' in payload) {
    return payload
  }

  // 예외적 형태 (HTTP 5xx 등)
  return {
    ok: false,
    error: {
      code: 'upstream_error',
      message: `서버 응답 오류 (HTTP ${response.status}).`
    }
  }
}

function sanitizeOptions(opts) {
  if (!opts || typeof opts !== 'object') return undefined
  const out = {}
  if (opts.targetLanguage === 'ko' || opts.targetLanguage === 'en' || opts.targetLanguage === 'ja') {
    out.targetLanguage = opts.targetLanguage
  }
  if (opts.length === 'short' || opts.length === 'normal' || opts.length === 'long') {
    out.length = opts.length
  }
  return Object.keys(out).length > 0 ? out : undefined
}

/**
 * service-worker 의 메시지 라우터에서 import 해서 등록하는 진입점.
 * 라우터가 { action, ...params } 을 넘기면 이 함수가 응답을 반환.
 */
export function registerYoutubeHandler(router, deps) {
  router.register('extractYoutube', (msg) =>
    handleExtractYoutube(
      { videoUrl: msg?.videoUrl, options: msg?.options },
      deps
    )
  )
}
