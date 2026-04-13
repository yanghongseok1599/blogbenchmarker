// extension/auth/login.js
// 로그인 화면 컨트롤러 — 폼 검증 + Supabase Auth 실제 호출.
// 확장 컨텍스트(chrome-extension://)는 전통적 CSRF 대상이 아니지만,
// OAuth state 파라미터는 콜백 하이재킹 방어 목적으로 반드시 검증한다.

import { supabase } from '../lib/supabase-client.js'
import { mapLoginError, mapOAuthError } from './auth-error-map.js'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const OAUTH_STATE_KEY = '__oauth_state'

function $(id) {
  return document.getElementById(id)
}

function showMessage(type, text) {
  const box = $('message')
  if (!box) return
  box.classList.remove('is-error', 'is-success', 'is-info')
  box.classList.add(type === 'error' ? 'is-error' : type === 'success' ? 'is-success' : 'is-info')
  box.textContent = text
  box.removeAttribute('hidden')
}

function clearMessage() {
  const box = $('message')
  if (!box) return
  box.setAttribute('hidden', '')
  box.textContent = ''
}

function setLoading(isLoading) {
  const btn = $('submit-btn')
  const gbtn = $('google-btn')
  if (btn) {
    btn.disabled = isLoading
    btn.textContent = isLoading ? '로그인 중...' : '로그인'
  }
  if (gbtn) gbtn.disabled = isLoading
}

// 클라이언트 검증은 UX 힌트. 실제 강제는 Supabase Auth 서버 측에서 이뤄진다.
function validate(email, password) {
  if (!email || !EMAIL_RE.test(email)) {
    return '올바른 이메일 주소를 입력해 주세요.'
  }
  if (!password || password.length < 8) {
    return '비밀번호는 8자 이상이어야 합니다.'
  }
  if (password.length > 72) {
    return '비밀번호는 72자 이하여야 합니다.'
  }
  return null
}

async function handleEmailLogin(event) {
  event.preventDefault()
  clearMessage()

  const email = $('email').value.trim().toLowerCase()
  const password = $('password').value

  const validationError = validate(email, password)
  if (validationError) {
    showMessage('error', validationError)
    return
  }

  setLoading(true)
  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    if (!data?.session) throw new Error('No session returned')

    showMessage('success', '로그인되었습니다. 잠시 후 창이 닫힙니다.')
    setTimeout(() => window.close(), 800)
  } catch (err) {
    showMessage('error', mapLoginError(err))
    console.warn('[auth/login] signInWithPassword failed')
  } finally {
    setLoading(false)
  }
}

async function generateAndStoreState() {
  const state = (crypto.randomUUID && crypto.randomUUID()) || fallbackUuid()
  // chrome.storage.session은 메모리 전용 → 브라우저 재시작 시 자동 소멸.
  // localStorage는 사용 금지(세션 간 오염 위험 + MV3 service worker 미지원).
  if (chrome.storage?.session) {
    await chrome.storage.session.set({ [OAUTH_STATE_KEY]: state })
  } else {
    await chrome.storage.local.set({ [OAUTH_STATE_KEY]: state })
  }
  return state
}

function fallbackUuid() {
  const buf = new Uint8Array(16)
  crypto.getRandomValues(buf)
  return Array.from(buf, (b) => b.toString(16).padStart(2, '0')).join('')
}

async function consumeStoredState() {
  const store = chrome.storage?.session ?? chrome.storage.local
  const out = await store.get(OAUTH_STATE_KEY)
  await store.remove(OAUTH_STATE_KEY)
  return out?.[OAUTH_STATE_KEY] ?? null
}

async function handleGoogleLogin() {
  clearMessage()
  setLoading(true)

  const expectedState = await generateAndStoreState()

  try {
    // TODO(manifest): chrome.identity.launchWebAuthFlow 사용을 위해 manifest에
    // "identity" 권한 추가가 필요합니다(기획자/백엔드 에이전트 담당).
    const redirectTo = chrome.identity?.getRedirectURL?.() ?? chrome.runtime.getURL('auth/callback.html')

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo,
        skipBrowserRedirect: true,
        queryParams: { state: expectedState },
      },
    })
    if (error) throw error
    if (!data?.url) throw new Error('No OAuth URL returned')

    if (!chrome.identity?.launchWebAuthFlow) {
      throw new Error('chrome.identity API unavailable (manifest identity permission missing)')
    }

    const responseUrl = await chrome.identity.launchWebAuthFlow({
      url: data.url,
      interactive: true,
    })

    if (!responseUrl) throw new Error('cancelled')

    const returnedState = new URL(responseUrl).searchParams.get('state')
    if (!returnedState || returnedState !== expectedState) {
      throw new Error('state_mismatch')
    }

    // 유효한 state 확인 후 Supabase SDK에 세션 교환을 위임.
    // exchangeCodeForSession은 PKCE flow에서 code를 세션으로 교환한다.
    const code = new URL(responseUrl).searchParams.get('code')
    if (code && supabase.auth.exchangeCodeForSession) {
      const { error: exchErr } = await supabase.auth.exchangeCodeForSession(code)
      if (exchErr) throw exchErr
    }

    showMessage('success', 'Google 로그인되었습니다.')
    setTimeout(() => window.close(), 800)
  } catch (err) {
    await consumeStoredState()
    showMessage('error', mapOAuthError(err))
    console.warn('[auth/login] OAuth flow failed')
  } finally {
    setLoading(false)
  }
}

function init() {
  const form = $('login-form')
  if (form) form.addEventListener('submit', handleEmailLogin)

  const gbtn = $('google-btn')
  if (gbtn) gbtn.addEventListener('click', handleGoogleLogin)
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init)
} else {
  init()
}
