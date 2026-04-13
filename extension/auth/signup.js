// extension/auth/signup.js
// 회원가입 컨트롤러 — 폼 검증 + Supabase signUp 호출 골격 + 이메일 인증 안내
// TODO: import { supabase } from '../lib/supabase-client.js'  (Phase 1.3)

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PASSWORD_RE = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/

function $(id) {
  return document.getElementById(id)
}

function showMessage(type, text) {
  const box = $('message')
  if (!box) return
  box.classList.remove('hidden')
  box.style.color = type === 'error' ? '#dc2626' : type === 'success' ? '#16a34a' : '#475569'
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
  if (!btn) return
  btn.disabled = isLoading
  btn.textContent = isLoading ? '가입 처리 중...' : '가입하기'
}

function showVerifyNotice() {
  const box = $('verify-notice')
  const form = $('signup-form')
  if (box) box.classList.remove('hidden')
  if (form) {
    Array.from(form.elements).forEach((el) => {
      el.disabled = true
    })
  }
}

function validate(email, password, passwordConfirm, termsChecked) {
  if (!email || !EMAIL_RE.test(email)) {
    return '올바른 이메일 주소를 입력해 주세요.'
  }
  if (!password || !PASSWORD_RE.test(password)) {
    return '비밀번호는 영문과 숫자를 포함해 8자 이상이어야 합니다.'
  }
  if (password !== passwordConfirm) {
    return '비밀번호가 일치하지 않습니다.'
  }
  if (!termsChecked) {
    return '이용약관과 개인정보 처리방침에 동의해 주세요.'
  }
  return null
}

function mapAuthError(err) {
  const msg = (err && err.message) ? err.message.toLowerCase() : ''
  if (msg.includes('already registered') || msg.includes('user already')) {
    return '이미 가입된 이메일입니다. 로그인해 주세요.'
  }
  if (msg.includes('password') && msg.includes('weak')) {
    return '비밀번호가 너무 단순합니다. 더 복잡한 비밀번호를 사용해 주세요.'
  }
  if (msg.includes('rate limit') || msg.includes('too many')) {
    return '시도 횟수가 너무 많습니다. 잠시 후 다시 시도해 주세요.'
  }
  if (msg.includes('network')) {
    return '네트워크 연결을 확인해 주세요.'
  }
  return '가입 처리에 실패했습니다. 잠시 후 다시 시도해 주세요.'
}

async function handleSignup(event) {
  event.preventDefault()
  clearMessage()

  const email = $('email').value.trim()
  const password = $('password').value
  const passwordConfirm = $('password-confirm').value
  const termsChecked = $('terms').checked

  const validationError = validate(email, password, passwordConfirm, termsChecked)
  if (validationError) {
    showMessage('error', validationError)
    return
  }

  setLoading(true)
  try {
    // TODO: Phase 1.3 에서 연결
    // const emailRedirectTo = chrome.runtime.getURL('auth/login.html')
    // const { data, error } = await supabase.auth.signUp({
    //   email,
    //   password,
    //   options: { emailRedirectTo },
    // })
    // if (error) throw error
    // showVerifyNotice()

    throw new Error('Supabase client not wired yet (Phase 1.3 pending).')
  } catch (err) {
    showMessage('error', mapAuthError(err))
    console.warn('[auth/signup] signUp failed:', err)
  } finally {
    setLoading(false)
  }
}

function init() {
  const form = $('signup-form')
  if (form) form.addEventListener('submit', handleSignup)
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init)
} else {
  init()
}
