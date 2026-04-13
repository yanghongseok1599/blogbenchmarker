// extension/auth/login.js
// 로그인 화면 컨트롤러 — 폼 검증 + Supabase Auth 호출 골격
// TODO: import { supabase } from '../lib/supabase-client.js'  (Phase 1.3에서 생성 예정)

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function $(id) {
  return document.getElementById(id)
}

function showMessage(type, text) {
  const box = $('message')
  if (!box) return
  box.classList.remove('hidden', 'text-red-600', 'text-green-600', 'text-slate-600')
  box.style.color = type === 'error' ? '#dc2626' : type === 'success' ? '#16a34a' : '#475569'
  box.classList.add(type === 'error' ? 'text-red-600' : type === 'success' ? 'text-green-600' : 'text-slate-600')
  box.textContent = text
}

function clearMessage() {
  const box = $('message')
  if (!box) return
  box.classList.add('hidden')
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

function validate(email, password) {
  if (!email || !EMAIL_RE.test(email)) {
    return '올바른 이메일 주소를 입력해 주세요.'
  }
  if (!password || password.length < 8) {
    return '비밀번호는 8자 이상이어야 합니다.'
  }
  return null
}

function mapAuthError(err) {
  const msg = (err && err.message) ? err.message.toLowerCase() : ''
  if (msg.includes('invalid login') || msg.includes('invalid credentials')) {
    return '이메일 또는 비밀번호가 올바르지 않습니다.'
  }
  if (msg.includes('email not confirmed')) {
    return '이메일 인증이 완료되지 않았습니다. 받은 편지함을 확인해 주세요.'
  }
  if (msg.includes('rate limit') || msg.includes('too many')) {
    return '시도 횟수가 너무 많습니다. 잠시 후 다시 시도해 주세요.'
  }
  if (msg.includes('network')) {
    return '네트워크 연결을 확인해 주세요.'
  }
  return '로그인에 실패했습니다. 잠시 후 다시 시도해 주세요.'
}

async function handleEmailLogin(event) {
  event.preventDefault()
  clearMessage()

  const email = $('email').value.trim()
  const password = $('password').value

  const validationError = validate(email, password)
  if (validationError) {
    showMessage('error', validationError)
    return
  }

  setLoading(true)
  try {
    // TODO: Phase 1.3 에서 supabase-client.js 생성 후 연결
    // const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    // if (error) throw error
    // chrome.tabs.create({ url: chrome.runtime.getURL('sidepanel/panel.html') })
    // window.close()

    throw new Error('Supabase client not wired yet (Phase 1.3 pending).')
  } catch (err) {
    showMessage('error', mapAuthError(err))
    console.warn('[auth/login] signInWithPassword failed:', err)
  } finally {
    setLoading(false)
  }
}

async function handleGoogleLogin() {
  clearMessage()
  setLoading(true)
  try {
    // TODO: Phase 1.3 에서 연결
    // const redirectTo = chrome.identity?.getRedirectURL?.() ?? chrome.runtime.getURL('auth/callback.html')
    // const { data, error } = await supabase.auth.signInWithOAuth({
    //   provider: 'google',
    //   options: { redirectTo, skipBrowserRedirect: true },
    // })
    // if (error) throw error
    // if (data?.url) chrome.tabs.create({ url: data.url })

    throw new Error('Supabase client not wired yet (Phase 1.3 pending).')
  } catch (err) {
    showMessage('error', 'Google 로그인 준비 중 문제가 발생했습니다.')
    console.warn('[auth/login] signInWithOAuth failed:', err)
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
