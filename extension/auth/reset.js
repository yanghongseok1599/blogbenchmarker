// extension/auth/reset.js
// 비밀번호 재설정 컨트롤러 — 이메일 확인 + resetPasswordForEmail 호출 골격
// TODO: import { supabase } from '../lib/supabase-client.js'  (Phase 1.3)

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

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
  btn.textContent = isLoading ? '전송 중...' : '재설정 메일 보내기'
}

function showSentNotice() {
  const box = $('sent-notice')
  const form = $('reset-form')
  if (box) box.classList.remove('hidden')
  if (form) {
    Array.from(form.elements).forEach((el) => {
      el.disabled = true
    })
  }
}

function validate(email) {
  if (!email || !EMAIL_RE.test(email)) {
    return '올바른 이메일 주소를 입력해 주세요.'
  }
  return null
}

function mapAuthError(err) {
  const msg = (err && err.message) ? err.message.toLowerCase() : ''
  if (msg.includes('rate limit') || msg.includes('too many')) {
    return '시도 횟수가 너무 많습니다. 잠시 후 다시 시도해 주세요.'
  }
  if (msg.includes('network')) {
    return '네트워크 연결을 확인해 주세요.'
  }
  return '메일 전송에 실패했습니다. 잠시 후 다시 시도해 주세요.'
}

async function handleReset(event) {
  event.preventDefault()
  clearMessage()

  const email = $('email').value.trim()

  const validationError = validate(email)
  if (validationError) {
    showMessage('error', validationError)
    return
  }

  setLoading(true)
  try {
    // TODO: Phase 1.3 에서 연결
    // 참고: 재설정 페이지는 Chrome Extension 외부로의 콜백이 필요하므로
    // Supabase Site URL에 등록된 외부 랜딩으로 리다이렉트하거나
    // chrome-extension:// URL을 allowlist에 추가해야 함.
    // const redirectTo = 'https://YOUR_DOMAIN/reset-confirm'
    // const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo })
    // if (error) throw error
    // showSentNotice()

    throw new Error('Supabase client not wired yet (Phase 1.3 pending).')
  } catch (err) {
    showMessage('error', mapAuthError(err))
    console.warn('[auth/reset] resetPasswordForEmail failed:', err)
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
