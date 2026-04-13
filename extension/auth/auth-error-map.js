// extension/auth/auth-error-map.js
// Supabase Auth 에러 원문 → i18n key → 사용자 친화 메시지 매핑.
// Why:
//   1) Supabase 원본 message 를 그대로 노출하면 내부 경로·스택이 누설될 수 있고
//      비영어권 사용자에게 난해하다 → 반드시 본 모듈 반환값만 UI 에 사용한다.
//   2) 다국어 지원(Phase 10) — 문자열을 i18n key 로 관리해 ko/en/ja 일괄 반영.
// 변경(2026-04-14):
//   원문 하드코딩 → i18n key 반환으로 전환. 화면 렌더 쪽에서 t(key) 로 실제 문자열 획득.

import { t } from '../lib/utils/i18n.js'

const COMMON_MATCHERS = [
  { keys: ['rate limit', 'too many'],                              i18nKey: 'error_rate_limit' },
  { keys: ['network', 'failed to fetch', 'networkerror'],         i18nKey: 'error_network' },
  { keys: ['timeout'],                                             i18nKey: 'error_timeout' },
]

const LOGIN_MATCHERS = [
  { keys: ['invalid login', 'invalid credentials', 'invalid grant'], i18nKey: 'error_login_invalid' },
  { keys: ['email not confirmed'],                                   i18nKey: 'error_login_unconfirmed' },
  { keys: ['user not found'],                                        i18nKey: 'error_login_user_not_found' },
  { keys: ['account locked', 'banned'],                              i18nKey: 'error_login_locked' },
]

const SIGNUP_MATCHERS = [
  { keys: ['already registered', 'user already', 'already exists'],  i18nKey: 'error_signup_already' },
  { keys: ['weak password', 'password should'],                      i18nKey: 'error_signup_weak' },
  { keys: ['invalid email'],                                         i18nKey: 'error_signup_invalid_email' },
]

const RESET_MATCHERS = [
  { keys: ['user not found'],                                        i18nKey: 'error_reset_not_found' },
]

const OAUTH_MATCHERS = [
  { keys: ['state_mismatch'],                                        i18nKey: 'error_oauth_state' },
  { keys: ['popup closed', 'user closed', 'cancelled', 'canceled'],  i18nKey: 'error_oauth_cancelled' },
  { keys: ['provider is not enabled'],                               i18nKey: 'error_oauth_unavailable' },
]

function pickKey(err, matchers, fallbackKey) {
  const raw = (err && err.message) ? String(err.message).toLowerCase() : ''
  for (const m of matchers) {
    if (m.keys.some((k) => raw.includes(k))) return m.i18nKey
  }
  return fallbackKey
}

// -----------------------------------------------------------------------------
// Public — localized message strings (UI 에 바로 노출)
// -----------------------------------------------------------------------------

export function mapLoginError(err) {
  return t(pickKey(err, [...LOGIN_MATCHERS, ...COMMON_MATCHERS], 'error_login_generic'))
}

export function mapSignupError(err) {
  return t(pickKey(err, [...SIGNUP_MATCHERS, ...COMMON_MATCHERS], 'error_signup_generic'))
}

export function mapResetError(err) {
  return t(pickKey(err, [...RESET_MATCHERS, ...COMMON_MATCHERS], 'error_reset_generic'))
}

export function mapOAuthError(err) {
  return t(pickKey(err, [...OAUTH_MATCHERS, ...COMMON_MATCHERS], 'error_oauth_generic'))
}

// -----------------------------------------------------------------------------
// Public — key-only variants (서버 로그·ARIA·테스트 용 — locale 무관한 안정 식별자)
// -----------------------------------------------------------------------------

export function mapLoginErrorKey(err)  { return pickKey(err, [...LOGIN_MATCHERS,  ...COMMON_MATCHERS], 'error_login_generic') }
export function mapSignupErrorKey(err) { return pickKey(err, [...SIGNUP_MATCHERS, ...COMMON_MATCHERS], 'error_signup_generic') }
export function mapResetErrorKey(err)  { return pickKey(err, [...RESET_MATCHERS,  ...COMMON_MATCHERS], 'error_reset_generic') }
export function mapOAuthErrorKey(err)  { return pickKey(err, [...OAUTH_MATCHERS,  ...COMMON_MATCHERS], 'error_oauth_generic') }
