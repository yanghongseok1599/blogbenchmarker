// extension/auth/signup.js
// 회원가입 컨트롤러 — 폼 검증 + Supabase signUp 실제 호출 + 이메일 인증 안내.

import { supabase } from '../lib/supabase-client.js'
import { mapSignupError } from './auth-error-map.js'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PASSWORD_RE = /^(?=.*[A-Za-z])(?=.*\d).{8,72}$/

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
  if (!btn) return
  btn.disabled = isLoading
  btn.textContent = isLoading ? '가입 처리 중...' : '가입하기'
}

function showVerifyNotice() {
  const box = $('verify-notice')
  const form = $('signup-form')
  if (box) box.removeAttribute('hidden')
  if (form) {
    Array.from(form.elements).forEach((el) => {
      el.disabled = true
    })
  }
}

// 클라이언트 검증은 UX 힌트. 실제 강제는 Supabase Auth 서버 측에서 이뤄진다.
function validate(email, password, passwordConfirm, termsChecked) {
  if (!email || !EMAIL_RE.test(email)) {
    return '올바른 이메일 주소를 입력해 주세요.'
  }
  if (!password || password.length < 8) {
    return '비밀번호는 8자 이상이어야 합니다.'
  }
  if (password.length > 72) {
    return '비밀번호는 72자 이하여야 합니다.'
  }
  if (!PASSWORD_RE.test(password)) {
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

async function handleSignup(event) {
  event.preventDefault()
  clearMessage()

  const email = $('email').value.trim().toLowerCase()
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
    // emailRedirectTo는 Supabase 대시보드의 "Redirect URLs" 허용목록에도 추가되어야 한다.
    // handle_new_user() 트리거가 profiles INSERT를 담당하므로 여기서는 별도 조치 없음.
    const emailRedirectTo = chrome.runtime.getURL('auth/login.html')

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo,
        data: {
          display_name: email.split('@')[0],
        },
      },
    })
    if (error) throw error
    if (!data?.user) throw new Error('No user returned')

    showVerifyNotice()
  } catch (err) {
    showMessage('error', mapSignupError(err))
    console.warn('[auth/signup] signUp failed')
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
