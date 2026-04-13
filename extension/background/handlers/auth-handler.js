// background/handlers/auth-handler.js
// 인증 관련 메시지 액션 핸들러 (Phase 2.2).
// 라우팅: service-worker.js → handlers/index.js → 이 모듈.
// 반환 규약: handler 는 성공 시 raw data 를 반환하고, router 가 { ok, data } 로 래핑한다.
// 예외 시에는 router 가 { ok: false, error: e.message } 로 매핑한다.
//
// 원칙:
//   - Supabase 원본 에러는 반드시 auth-error-map 으로 한국어로 치환 후 throw
//   - chrome.storage.local 만 사용 (sync/managed 금지)
//   - 로그아웃 순서: __intentional_logout 플래그 → signOut → storage.clear
//     (onAuthStateChange 리스너가 플래그 존재 시 자동 재로그인 트리거를 중화한다)
//   - sender 검증은 service-worker.js 레벨에서 수행 (라우터 공통)

import {
  supabase,
  getSession,
  onAuthChange as libOnAuthChange,
} from '../../lib/supabase-client.js'
import { getProfile } from '../../lib/repositories/user-repo.js'
import {
  mapLoginError,
  mapSignupError,
  mapResetError,
} from '../../auth/auth-error-map.js'

/** chrome.storage.local 키 상수 */
const LOGOUT_FLAG_KEY = '__intentional_logout'
const LAST_LOGIN_AT_KEY = '__auth_last_login_at'

/** onAuthChange 브로드캐스트 구독 중복 방지 플래그(SW 전역) */
let authChangeBound = false
/** 구독 해제 함수 — 보관해야 서비스 워커 종료 전 정리 가능 */
let unsubAuthChange = null

/**
 * @typedef {Object} SessionSummary
 * @property {string} userId
 * @property {string | null} email
 * @property {string | null} displayName
 * @property {'free' | 'pro' | 'unlimited'} plan
 * @property {boolean} isAdmin
 * @property {boolean} emailConfirmed
 * @property {number | null} expiresAt  (unix seconds)
 */

/**
 * Supabase User + profiles + session 을 UI 친화 형태로 정규화.
 * 민감 필드(access_token 등)는 내보내지 않는다.
 * @param {import('@supabase/supabase-js').User | null} user
 * @param {import('../../lib/repositories/user-repo.js').Profile | null} profile
 * @param {import('@supabase/supabase-js').Session | null} session
 * @returns {SessionSummary | null}
 */
function toSummary(user, profile, session) {
  if (!user) return null
  return {
    userId: user.id,
    email: user.email ?? profile?.email ?? null,
    displayName: profile?.display_name ?? null,
    plan: /** @type {'free'|'pro'|'unlimited'} */ (profile?.plan ?? 'free'),
    isAdmin: profile?.is_admin === true,
    emailConfirmed: Boolean(user.email_confirmed_at),
    expiresAt: session?.expires_at ?? null,
  }
}

/**
 * 프로필 조회를 방어적으로 감싼다.
 * 프로필이 아직 생성 전(signup 직후 트리거 race)이거나 RLS 로 차단돼도 null 반환.
 * @param {string} userId
 */
async function loadProfileSafe(userId) {
  try {
    return await getProfile(userId)
  } catch (err) {
    console.warn('[auth-handler] getProfile 실패 (계속 진행)', err?.message)
    return null
  }
}

/**
 * 입력 문자열 정리(trim + lowercase). 이메일 표준화.
 * @param {unknown} v
 */
function normalizeEmail(v) {
  return String(v ?? '').trim().toLowerCase()
}

/**
 * @namespace authHandler
 * 각 메서드는 payload 객체 1개를 받는다. router 가 {ok:true,data:...} 로 감싸준다.
 */
export const authHandler = {
  /**
   * 이메일/비밀번호 로그인.
   * @param {{ email: string, password: string }} payload
   * @returns {Promise<SessionSummary>}
   */
  async login(payload) {
    const email = normalizeEmail(payload?.email)
    const password = String(payload?.password ?? '')
    if (!email || !password) {
      throw new Error('이메일과 비밀번호를 입력해 주세요.')
    }

    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw new Error(mapLoginError(error))

    const user = data?.user ?? null
    const session = data?.session ?? null
    if (!user) throw new Error(mapLoginError({ message: 'invalid credentials' }))

    const profile = await loadProfileSafe(user.id)

    // 이전 로그아웃 플래그 정리 + 마지막 로그인 시각 기록(비민감 메타).
    await chrome.storage.local.remove([LOGOUT_FLAG_KEY])
    await chrome.storage.local.set({ [LAST_LOGIN_AT_KEY]: Date.now() })

    const summary = toSummary(user, profile, session)
    if (!summary) throw new Error(mapLoginError({ message: 'invalid credentials' }))
    return summary
  },

  /**
   * 이메일 회원가입.
   * @param {{ email: string, password: string, displayName?: string }} payload
   * @returns {Promise<{ userId: string | null, email: string, needsEmailConfirmation: boolean }>}
   */
  async signup(payload) {
    const email = normalizeEmail(payload?.email)
    const password = String(payload?.password ?? '')
    const displayNameRaw = payload?.displayName
    const displayName = displayNameRaw ? String(displayNameRaw).trim() : null

    if (!email || !password) throw new Error('이메일과 비밀번호를 입력해 주세요.')
    if (password.length < 8) throw new Error('비밀번호는 8자 이상이어야 합니다.')
    if (password.length > 72) throw new Error('비밀번호는 72자 이하여야 합니다.')

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        // handle_new_user 트리거가 raw_user_meta_data->>'display_name' 을 읽는다.
        data: displayName ? { display_name: displayName } : {},
      },
    })
    if (error) throw new Error(mapSignupError(error))

    return {
      userId: data?.user?.id ?? null,
      email,
      // session 이 없으면 이메일 확인 단계. UI 가 이 플래그로 안내 화면 분기.
      needsEmailConfirmation: !data?.session,
    }
  },

  /**
   * 비밀번호 재설정 메일 발송.
   * @param {{ email: string, redirectTo?: string }} payload
   * @returns {Promise<{ sent: boolean, email: string }>}
   */
  async resetPassword(payload) {
    const email = normalizeEmail(payload?.email)
    const redirectTo = payload?.redirectTo ? String(payload.redirectTo) : undefined
    if (!email) throw new Error('이메일을 입력해 주세요.')

    const { error } = await supabase.auth.resetPasswordForEmail(
      email,
      redirectTo ? { redirectTo } : undefined
    )
    if (error) throw new Error(mapResetError(error))
    return { sent: true, email }
  },

  /**
   * 로그아웃 — 자동 재로그인 방지 순서 엄수.
   *   1) __intentional_logout 플래그 선 설정
   *   2) supabase.auth.signOut()
   *   3) chrome.storage.local.clear()
   * 서버 signOut 이 실패해도 로컬 잔존 상태는 반드시 제거한다.
   * @returns {Promise<{ redirectTo: string }>}
   */
  async logout() {
    await chrome.storage.local.set({ [LOGOUT_FLAG_KEY]: true })

    try {
      const { error } = await supabase.auth.signOut()
      if (error) {
        console.warn('[auth-handler] signOut 서버 응답 에러 (로컬 정리 진행)', error.message)
      }
    } catch (err) {
      console.warn('[auth-handler] signOut 네트워크 에러 (로컬 정리 진행)', err?.message)
    }

    // 플래그는 onAuthStateChange 가 SIGNED_OUT 이벤트를 드레인할 때까지 필요 → clear 가 지움.
    await chrome.storage.local.clear()
    // session storage 가 존재하는 환경에서만 정리.
    if (chrome.storage.session?.clear) {
      try { await chrome.storage.session.clear() } catch { /* 일부 환경 미지원 */ }
    }

    return { redirectTo: chrome.runtime.getURL('auth/login.html') }
  },

  /**
   * 현재 세션 조회 (UI 최초 진입 시 호출).
   * @returns {Promise<{ loggedIn: false } | ({ loggedIn: true } & SessionSummary)>}
   */
  async getSession() {
    const session = await getSession()
    const user = session?.user ?? null
    if (!user) return { loggedIn: false }

    const profile = await loadProfileSafe(user.id)
    const summary = toSummary(user, profile, session)
    return summary
      ? { loggedIn: true, ...summary }
      : { loggedIn: false }
  },

  /**
   * SW 내부에 onAuthStateChange 리스너 1개를 등록하고, 모든 확장 컨텍스트로 브로드캐스트.
   * 멱등 — 여러 번 호출돼도 리스너는 1개만 유지된다.
   *
   * 자동 재로그인 방지: __intentional_logout 플래그가 true 이면 SIGNED_OUT 이 아닌
   * 이벤트(TOKEN_REFRESHED, SIGNED_IN 등)는 브로드캐스트를 생략한다.
   *
   * @returns {Promise<{ subscribed: true, alreadyBound?: boolean }>}
   */
  async onAuthChange() {
    if (authChangeBound) return { subscribed: true, alreadyBound: true }
    authChangeBound = true

    unsubAuthChange = libOnAuthChange(async (event, session) => {
      try {
        const stored = await chrome.storage.local.get([LOGOUT_FLAG_KEY])
        if (stored?.[LOGOUT_FLAG_KEY] && event !== 'SIGNED_OUT') {
          // 로그아웃 의도가 살아있는데 SDK 가 재진입(SIGNED_IN/TOKEN_REFRESHED)시 무시.
          return
        }
        // 민감 토큰은 전달하지 않는다(userId/email/expiresAt 만).
        const safeSession = session
          ? {
              userId: session.user?.id ?? null,
              email: session.user?.email ?? null,
              expiresAt: session.expires_at ?? null,
            }
          : null
        chrome.runtime.sendMessage({ type: 'auth:change', event, session: safeSession })
          .catch(() => { /* 수신자 없음(사이드패널 닫힘) — 정상 */ })
      } catch (err) {
        console.warn('[auth-handler] onAuthChange 브로드캐스트 실패', err?.message)
      }
    })

    return { subscribed: true }
  },
}

/**
 * 서비스 워커 종료 시 리스너 정리용(현재 SW 라이프사이클 상 호출 시점 한정적).
 * 외부 테스트/리셋 용도로 노출.
 */
export function __resetAuthChangeBinding() {
  try { unsubAuthChange?.() } catch { /* noop */ }
  unsubAuthChange = null
  authChangeBound = false
}
