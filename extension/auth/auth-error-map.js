// extension/auth/auth-error-map.js
// Supabase Auth 에러 원문을 사용자 친화 한국어 메시지로 매핑.
// Why: Supabase 원본 message를 그대로 노출하면 내부 경로·스택을 누설할 수 있고
//      비영어권 사용자에게 난해하다. 화면에는 반드시 이 모듈의 반환값만 사용한다.

const COMMON_MATCHERS = [
  { keys: ['rate limit', 'too many'], message: '시도 횟수가 너무 많습니다. 잠시 후 다시 시도해 주세요.' },
  { keys: ['network', 'failed to fetch', 'networkerror'], message: '네트워크 연결을 확인해 주세요.' },
  { keys: ['timeout'], message: '서버 응답이 지연되고 있습니다. 잠시 후 다시 시도해 주세요.' },
]

const LOGIN_MATCHERS = [
  { keys: ['invalid login', 'invalid credentials', 'invalid grant'], message: '이메일 또는 비밀번호가 올바르지 않습니다.' },
  { keys: ['email not confirmed'], message: '이메일 인증이 완료되지 않았습니다. 받은 편지함을 확인해 주세요.' },
  { keys: ['user not found'], message: '등록되지 않은 이메일입니다.' },
  { keys: ['account locked', 'banned'], message: '계정 이용이 제한되었습니다. 고객센터로 문의해 주세요.' },
]

const SIGNUP_MATCHERS = [
  { keys: ['already registered', 'user already', 'already exists'], message: '이미 가입된 이메일입니다. 로그인해 주세요.' },
  { keys: ['weak password', 'password should'], message: '비밀번호가 너무 단순합니다. 더 복잡한 비밀번호를 사용해 주세요.' },
  { keys: ['invalid email'], message: '올바른 이메일 주소를 입력해 주세요.' },
]

const RESET_MATCHERS = [
  { keys: ['user not found'], message: '등록되지 않은 이메일입니다.' },
]

const OAUTH_MATCHERS = [
  { keys: ['state_mismatch'], message: '보안 검증에 실패했습니다. 페이지를 새로고침한 후 다시 시도해 주세요.' },
  { keys: ['popup closed', 'user closed', 'cancelled', 'canceled'], message: 'Google 로그인이 취소되었습니다.' },
  { keys: ['provider is not enabled'], message: '현재 Google 로그인을 사용할 수 없습니다. 잠시 후 다시 시도해 주세요.' },
]

function pickMessage(err, matchers, fallback) {
  const raw = (err && err.message) ? String(err.message).toLowerCase() : ''
  for (const m of matchers) {
    if (m.keys.some((k) => raw.includes(k))) return m.message
  }
  return fallback
}

export function mapLoginError(err) {
  return pickMessage(err, [...LOGIN_MATCHERS, ...COMMON_MATCHERS], '로그인에 실패했습니다. 잠시 후 다시 시도해 주세요.')
}

export function mapSignupError(err) {
  return pickMessage(err, [...SIGNUP_MATCHERS, ...COMMON_MATCHERS], '가입 처리에 실패했습니다. 잠시 후 다시 시도해 주세요.')
}

export function mapResetError(err) {
  return pickMessage(err, [...RESET_MATCHERS, ...COMMON_MATCHERS], '메일 전송에 실패했습니다. 잠시 후 다시 시도해 주세요.')
}

export function mapOAuthError(err) {
  return pickMessage(err, [...OAUTH_MATCHERS, ...COMMON_MATCHERS], 'Google 로그인 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.')
}
