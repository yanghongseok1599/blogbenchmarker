// extension/auth/reset.js
// 비밀번호 재설정 컨트롤러 — 이메일 확인 + resetPasswordForEmail 실제 호출.

import { supabase } from '../lib/supabase-client.js'
import { mapResetError } from './auth-error-map.js'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

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
  btn.textContent = isLoading ? '전송 중...' : '재설정 메일 보내기'
}

function showSentNotice() {
  const box = $('sent-notice')
  const form = $('reset-form')
  if (box) box.removeAttribute('hidden')
  if (form) {
    Array.from(form.elements).forEach((el) => {
      el.disabled = true
    })
  }
}

// 클라이언트 검증은 UX 힌트. 실제 강제는 Supabase Auth 서버 측에서 이뤄진다.
function validate(email) {
  if (!email || !EMAIL_RE.test(email)) {
    return '올바른 이메일 주소를 입력해 주세요.'
  }
  return null
}

async function handleReset(event) {
  event.preventDefault()
  clearMessage()

  const email = $('email').value.trim().toLowerCase()

  const validationError = validate(email)
  if (validationError) {
    showMessage('error', validationError)
    return
  }

  setLoading(true)
  try {
    // 재설정 페이지는 Chrome Extension 외부 랜딩이 필요하다.
    // Supabase 대시보드의 Site URL에 등록된 URL로 리다이렉트한다.
    // 확장 내 페이지를 사용하려면 Redirect URLs에 chrome-extension://<ID>/auth/reset-confirm.html 추가 필요.
    const redirectTo = chrome.runtime.getURL('auth/login.html')

    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo })
    if (error) throw error

    showSentNotice()
  } catch (err) {
    showMessage('error', mapResetError(err))
    console.warn('[auth/reset] resetPasswordForEmail failed')
  } finally {
    setLoading(false)
  }
}

function init() {
  const form = $('reset-form')
  if (form) form.addEventListener('submit', handleReset)
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init)
} else {
  init()
}
