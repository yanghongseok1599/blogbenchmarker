// supabase-client.js
// Supabase JS SDK 초기화 래퍼.
// - MV3 CSP(script-src 'self') 상 원격 CDN 로드 불가 → ESM 번들을 로컬에 벤더링
//   (extension/lib/vendor/supabase-esm.js, esbuild 로 @supabase/supabase-js 번들링)
// - ES modules 환경에서 import 해서 사용 (Service Worker type:"module" + 페이지 <script type="module">).

import { SUPABASE_URL, SUPABASE_ANON_KEY } from './env-config.js'
import { createClient } from './vendor/supabase-esm.js'

/**
 * chrome.storage.local 을 Supabase Auth storage 로 어댑팅한다.
 * Service Worker 재시작·사이드패널 재오픈 시에도 세션이 복원되도록 한다.
 * Supabase SDK 의 storage 인터페이스는 getItem/setItem/removeItem 3종만 요구한다.
 * @type {{ getItem: (key: string) => Promise<string|null>, setItem: (key: string, value: string) => Promise<void>, removeItem: (key: string) => Promise<void> }}
 */
const chromeStorageAdapter = {
  getItem(key) {
    return new Promise((resolve) => {
      chrome.storage.local.get([key], (result) => resolve(result?.[key] ?? null))
    })
  },
  setItem(key, value) {
    return new Promise((resolve) => {
      chrome.storage.local.set({ [key]: value }, () => resolve())
    })
  },
  removeItem(key) {
    return new Promise((resolve) => {
      chrome.storage.local.remove([key], () => resolve())
    })
  },
}

/**
 * env-config.js 의 URL/KEY 가 템플릿 상태(placeholder)인지 검사한다.
 * @param {string} url
 * @param {string} key
 * @returns {boolean} 유효하면 true
 */
function hasValidEnv(url, key) {
  if (!url || !key) return false
  if (url.includes('your-project-ref')) return false
  if (key.includes('YOUR_KEY_HERE')) return false
  return true
}

if (!hasValidEnv(SUPABASE_URL, SUPABASE_ANON_KEY)) {
  // 빌드/개발 환경에서 env-config.js 를 복사하지 않은 경우 즉시 알림.
  // throw 하지 않는 이유: 서비스 워커 전체가 죽으면 메시지 라우터도 멈춘다.
  console.warn(
    '[supabase-client] env-config.js 가 템플릿 상태입니다. SUPABASE_URL / SUPABASE_ANON_KEY 를 채우세요.'
  )
}

/**
 * Supabase 클라이언트 단일 인스턴스.
 * - autoRefreshToken: JWT 만료 자동 갱신
 * - persistSession:   chrome.storage.local 에 세션 저장
 * - detectSessionInUrl: 확장프로그램에는 URL hash 기반 OAuth redirect 가 없으므로 false
 */
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: chromeStorageAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
})

// ---------------------------------------------------------------------------
// 세션 헬퍼 — handlers / UI 에서 반복되는 패턴을 추출
// ---------------------------------------------------------------------------

/**
 * 현재 로그인 세션을 조회한다.
 * SDK 가 내부적으로 chromeStorageAdapter 를 읽어 세션을 복원한다.
 * @returns {Promise<import('@supabase/supabase-js').Session | null>}
 */
export async function getSession() {
  const { data, error } = await supabase.auth.getSession()
  if (error) throw new Error(`세션 조회 실패: ${error.message}`)
  return data?.session ?? null
}

/**
 * 현재 로그인 사용자 객체를 조회한다.
 * @returns {Promise<import('@supabase/supabase-js').User | null>}
 */
export async function getCurrentUser() {
  const session = await getSession()
  return session?.user ?? null
}

/**
 * 외부에서 받은 세션(access_token/refresh_token)을 SDK 에 주입한다.
 * 주로 다른 컨텍스트(팝업 → 서비스 워커) 간 세션 전달 시 사용.
 * @param {{ access_token: string, refresh_token: string }} tokens
 * @returns {Promise<import('@supabase/supabase-js').Session | null>}
 */
export async function setSession(tokens) {
  if (!tokens?.access_token || !tokens?.refresh_token) {
    throw new Error('setSession: access_token / refresh_token 필수')
  }
  const { data, error } = await supabase.auth.setSession(tokens)
  if (error) throw new Error(`세션 설정 실패: ${error.message}`)
  return data?.session ?? null
}

/**
 * 세션 상태 변화(로그인/로그아웃/토큰 갱신) 리스너를 등록한다.
 * unsubscribe 함수를 반환하므로 onDisconnect / beforeunload 에서 호출해 정리한다.
 * @param {(event: string, session: import('@supabase/supabase-js').Session | null) => void} listener
 * @returns {() => void} unsubscribe
 */
export function onAuthChange(listener) {
  const { data } = supabase.auth.onAuthStateChange((event, session) => listener(event, session))
  return () => data?.subscription?.unsubscribe?.()
}
