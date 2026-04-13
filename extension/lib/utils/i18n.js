// extension/lib/utils/i18n.js
// 다국어 메시지 로더 — chrome.i18n 래퍼 + 런타임 언어 전환
//
// 배경:
//   chrome.i18n.getMessage() 는 manifest 의 default_locale 과 사용자 브라우저 언어만
//   자동 반영한다. 우리는 profiles.language(DB) 기반 '확장프로그램 내부 언어 설정'
//   을 지원해야 하므로, 전환 시에는 _locales/<locale>/messages.json 을 fetch 해
//   메모리 캐시에서 조회하는 방식으로 덮어쓴다.
//
// 3단 fallback:
//   1) overrideLocale 이 설정돼 있고 캐시에 key 가 있으면 overrideLocale 값 사용
//   2) chrome.i18n.getMessage(key, substitutions) — manifest 기본 동작
//   3) key 자체 반환 + console.warn (누락 경고)
//
// 설계 원칙:
//   - 파일 1개, 외부 의존성 0 (pure vanilla)
//   - 비동기 setLocale() 은 Promise 반환. await 하지 않아도 안전(비차단).
//   - t() 는 동기 함수 — 캐시 미스는 chrome.i18n 경로로 즉시 폴백.
//   - 자식 프레임/서비스 워커 모두에서 사용 가능 (chrome.i18n / fetch 만 의존).

// -----------------------------------------------------------------------------
// 상수
// -----------------------------------------------------------------------------

export const SUPPORTED_LOCALES = Object.freeze(['ko', 'en', 'ja'])
export const DEFAULT_LOCALE = 'ko'

// profiles.language 에서 chrome locale 로 매핑하는 표
// (향후 'ko-KR' 같은 지역 코드 들어올 경우 대비)
const LOCALE_ALIASES = {
  'ko-KR': 'ko',
  'en-US': 'en',
  'en-GB': 'en',
  'ja-JP': 'ja'
}

// -----------------------------------------------------------------------------
// 내부 상태 (모듈 스코프 — 전역 오염 없음)
// -----------------------------------------------------------------------------

let overrideLocale = null                     // 사용자 설정 언어 (예: 'ja')
const cache = new Map()                       // locale → messages object
const missingKeys = new Set()

// -----------------------------------------------------------------------------
// Public: locale 전환
// -----------------------------------------------------------------------------

/**
 * locale 정규화. 지원하지 않는 값은 DEFAULT_LOCALE.
 */
export function normalizeLocale(raw) {
  if (!raw || typeof raw !== 'string') return DEFAULT_LOCALE
  const lower = raw.trim().toLowerCase()
  if (SUPPORTED_LOCALES.includes(lower)) return lower
  if (LOCALE_ALIASES[raw] && SUPPORTED_LOCALES.includes(LOCALE_ALIASES[raw])) {
    return LOCALE_ALIASES[raw]
  }
  // 접두사 매칭 (예: 'ko-xyz' → 'ko')
  const prefix = lower.split('-')[0]
  if (SUPPORTED_LOCALES.includes(prefix)) return prefix
  return DEFAULT_LOCALE
}

/**
 * 현재 override locale 반환. 설정된 적 없으면 null (chrome.i18n 기본 경로).
 */
export function getLocale() {
  return overrideLocale
}

/**
 * locale 을 설정하고 messages.json 을 fetch 해 캐시에 로드.
 * 이미 캐시에 있으면 재요청 없음. 실패 시 조용히 chrome.i18n 폴백 유지.
 * @param {string} rawLocale
 * @returns {Promise<string>} 실제 적용된 locale
 */
export async function setLocale(rawLocale) {
  const locale = normalizeLocale(rawLocale)
  if (locale === DEFAULT_LOCALE) {
    // manifest default_locale 은 chrome.i18n 이 이미 처리하므로
    // 별도 캐시 로드 없이 override 해제.
    overrideLocale = null
    return locale
  }
  if (!cache.has(locale)) {
    try {
      const messages = await loadMessages(locale)
      cache.set(locale, messages)
    } catch (err) {
      // 네트워크/파일 오류 — override 미설정으로 폴백
      console.warn('[i18n] setLocale failed, falling back to manifest', {
        locale,
        err: err?.message
      })
      overrideLocale = null
      return DEFAULT_LOCALE
    }
  }
  overrideLocale = locale
  return locale
}

/**
 * override 해제 (manifest 기본 로직으로 복귀).
 */
export function clearLocale() {
  overrideLocale = null
}

// -----------------------------------------------------------------------------
// Public: 메시지 조회
// -----------------------------------------------------------------------------

/**
 * 메시지 조회. 동기 함수 — UI 렌더 경로에서 즉시 사용 가능.
 * @param {string} key
 * @param {string|Array<string>} [substitutions] — $1, $2... 치환값
 * @returns {string}
 */
export function t(key, substitutions) {
  if (!key || typeof key !== 'string') return ''
  const args = normalizeSubstitutions(substitutions)

  // 1) override locale 캐시 조회
  if (overrideLocale && cache.has(overrideLocale)) {
    const entry = cache.get(overrideLocale)[key]
    if (entry && typeof entry.message === 'string') {
      return applySubstitutions(entry.message, args, entry.placeholders)
    }
  }

  // 2) chrome.i18n 기본 경로
  try {
    if (typeof chrome !== 'undefined' && chrome?.i18n?.getMessage) {
      const msg = chrome.i18n.getMessage(key, args)
      if (msg) return msg
    }
  } catch (_) {
    // chrome.i18n 미가용 환경 (테스트 등) — 무시
  }

  // 3) 누락 — key 를 반환해 UI 에 문제가 바로 보이게 한다.
  if (!missingKeys.has(key)) {
    missingKeys.add(key)
    console.warn(`[i18n] missing message key: ${key}`)
  }
  return key
}

// -----------------------------------------------------------------------------
// Public: DOM 바인딩 (HTML 전환)
// -----------------------------------------------------------------------------

/**
 * 지정된 root 하위의 data-i18n 속성을 일괄 치환.
 *
 * 지원 속성:
 *   - data-i18n="key"            → textContent
 *   - data-i18n-attr="attr:key;attr2:key2"
 *         예: <input data-i18n-attr="placeholder:auth_field_email_placeholder">
 *   - data-i18n-aria="key"       → aria-label
 *   - data-i18n-title="key"      → title
 *
 * innerHTML 은 절대 사용하지 않음 — textContent / setAttribute 만.
 */
export function applyI18n(root = (typeof document !== 'undefined' ? document : null)) {
  if (!root) return
  // textContent
  root.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.getAttribute('data-i18n')
    if (!key) return
    el.textContent = t(key)
  })
  // 일반 attribute
  root.querySelectorAll('[data-i18n-attr]').forEach((el) => {
    const spec = el.getAttribute('data-i18n-attr') || ''
    for (const pair of spec.split(';')) {
      const trimmed = pair.trim()
      if (!trimmed) continue
      const [attr, key] = trimmed.split(':').map((s) => s.trim())
      if (!attr || !key) continue
      el.setAttribute(attr, t(key))
    }
  })
  // aria-label / title shortcuts
  root.querySelectorAll('[data-i18n-aria]').forEach((el) => {
    const key = el.getAttribute('data-i18n-aria')
    if (key) el.setAttribute('aria-label', t(key))
  })
  root.querySelectorAll('[data-i18n-title]').forEach((el) => {
    const key = el.getAttribute('data-i18n-title')
    if (key) el.setAttribute('title', t(key))
  })
  // <html lang> 업데이트
  if (root.documentElement?.setAttribute) {
    root.documentElement.setAttribute('lang', overrideLocale ?? DEFAULT_LOCALE)
  }
}

// -----------------------------------------------------------------------------
// Public: 초기화 — 세션 저장소에서 locale 복원
// -----------------------------------------------------------------------------

const STORAGE_KEY = '__i18n_locale'

/**
 * 저장된 locale (chrome.storage.local) 을 읽어 setLocale 호출 후 applyI18n 수행.
 * 저장 없으면 manifest default 로 초기화.
 * DOMContentLoaded 직후 한 번 호출하면 모든 data-i18n 이 반영된다.
 *
 * @param {Object} [opts]
 * @param {boolean} [opts.applyToDom=true]
 * @returns {Promise<string>} 적용된 locale
 */
export async function initI18n(opts = {}) {
  const applyToDom = opts.applyToDom !== false
  let saved = null
  try {
    if (typeof chrome !== 'undefined' && chrome?.storage?.local) {
      const got = await chrome.storage.local.get(STORAGE_KEY)
      saved = got?.[STORAGE_KEY] ?? null
    }
  } catch (_) {
    // storage 접근 불가 — 무시
  }
  const locale = await setLocale(saved ?? DEFAULT_LOCALE)
  if (applyToDom && typeof document !== 'undefined') {
    applyI18n(document)
  }
  return locale
}

/**
 * 사용자가 언어 드롭다운에서 선택했을 때 호출.
 * 저장 + 로드 + DOM 재적용 까지 일괄 수행.
 */
export async function changeLocale(rawLocale) {
  const locale = await setLocale(rawLocale)
  try {
    if (typeof chrome !== 'undefined' && chrome?.storage?.local) {
      await chrome.storage.local.set({ [STORAGE_KEY]: locale })
    }
  } catch (_) { /* 무시 */ }
  if (typeof document !== 'undefined') applyI18n(document)
  return locale
}

// -----------------------------------------------------------------------------
// Internal
// -----------------------------------------------------------------------------

async function loadMessages(locale) {
  const url = chrome?.runtime?.getURL
    ? chrome.runtime.getURL(`_locales/${locale}/messages.json`)
    : `../../_locales/${locale}/messages.json`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`messages.json fetch failed: ${res.status}`)
  return await res.json()
}

function normalizeSubstitutions(subs) {
  if (subs == null) return undefined
  if (Array.isArray(subs)) return subs.map((v) => String(v))
  return [String(subs)]
}

/**
 * chrome.i18n 형식의 placeholder 를 값으로 치환.
 *   - $1, $2, … : args 배열 인덱스 치환
 *   - $NAME$   : placeholders[name].content = "$N" → args[N-1]
 *
 * 구현: 문자열 탐색 + 교체. 동적 RegExp 생성 없음.
 */
function applySubstitutions(message, args, placeholders) {
  if (!message) return ''
  let out = String(message)

  // $NAME$ 치환 (placeholders 정의가 있을 때)
  if (placeholders && typeof placeholders === 'object' && Array.isArray(args)) {
    for (const name of Object.keys(placeholders)) {
      const def = placeholders[name]
      const content = def && typeof def.content === 'string' ? def.content : ''
      if (!content) continue
      // content 는 "$1", "$2" 형태 — 해당 인덱스의 args 값 사용
      let idx = -1
      if (content.length >= 2 && content.charAt(0) === '$') {
        const n = Number(content.slice(1))
        if (Number.isFinite(n) && n >= 1) idx = n - 1
      }
      if (idx < 0) continue
      const value = args[idx] != null ? String(args[idx]) : ''
      // 대소문자 무시 "$NAME$" 교체 — 반복 치환 루프
      out = replaceAllCaseInsensitive(out, '$' + name + '$', value)
    }
  }

  // $1..$9 직접 치환 (placeholders 없이 사용하는 경우)
  if (Array.isArray(args) && args.length > 0) {
    for (let i = args.length; i >= 1; i--) {
      const token = '$' + i
      const value = args[i - 1] != null ? String(args[i - 1]) : ''
      out = replaceAllPlain(out, token, value)
    }
  }
  return out
}

/**
 * 단순 문자열 교체 루프 (indexOf 기반). 동적 정규식 없음.
 */
function replaceAllPlain(haystack, needle, value) {
  if (!needle) return haystack
  let out = ''
  let i = 0
  while (true) {
    const found = haystack.indexOf(needle, i)
    if (found < 0) { out += haystack.slice(i); break }
    out += haystack.slice(i, found) + value
    i = found + needle.length
  }
  return out
}

function replaceAllCaseInsensitive(haystack, needle, value) {
  if (!needle) return haystack
  const nLower = needle.toLowerCase()
  const hLower = haystack.toLowerCase()
  let out = ''
  let i = 0
  while (true) {
    const found = hLower.indexOf(nLower, i)
    if (found < 0) { out += haystack.slice(i); break }
    out += haystack.slice(i, found) + value
    i = found + needle.length
  }
  return out
}
