// admin.js — Phase 11 관리자 페이지 라우터/게이트
//
// 책임:
//   1) Supabase 세션 + profiles.is_admin 게이트 (실패 시 페이지 차단 + 로그인 리다이렉트)
//   2) 4개 탭 활성화 — 각 탭의 데이터/렌더 로직은 admin/tabs/*.js 가 담당
//
// 안전 규칙(chrome-extension-security §3):
//   - 모든 DOM 조작은 dom-safe.js 헬퍼 사용 (위험 속성 직접 할당 0건)
//   - service_role 은 절대 클라이언트에서 보유하지 않는다 — 모든 force 작업은 admin-actions Edge Function 호출

import { safeText } from '../lib/dom-safe.js'
import { supabase } from '../lib/supabase-client.js'
import { prettyError } from './utils.js'
import { bindUsersTab, loadUsers } from './tabs/users.js'
import { bindSettingsTab, loadSettings } from './tabs/settings.js'
import { bindBanwordsTab, loadBanWords } from './tabs/banwords.js'
import { bindAuditTab, loadAudit } from './tabs/audit.js'

const TABS = ['users', 'settings', 'banwords', 'audit']

const els = {
  /** @type {HTMLElement | null} */ gate: null,
  /** @type {HTMLElement | null} */ gateMsg: null,
  /** @type {HTMLElement | null} */ main: null,
  /** @type {HTMLElement | null} */ meEmail: null,
}

// ─────────────────────────────────────────────────────────────
// 부팅
// ─────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  els.gate = document.querySelector('[data-role="gate"]')
  els.gateMsg = document.querySelector('[data-role="gate-msg"]')
  els.main = document.querySelector('[data-role="main"]')
  els.meEmail = document.querySelector('[data-role="me-email"]')

  showGate('권한 확인 중...')

  let me
  try {
    me = await ensureAdmin()
  } catch (e) {
    showGate(prettyError(e), 'error')
    return
  }

  if (!me) {
    redirectToLogin('관리자 권한이 필요합니다.')
    return
  }

  hideGate()
  if (els.meEmail) safeText(els.meEmail, me.email || '')

  bindGlobalEvents()
  bindUsersTab()
  bindSettingsTab()
  bindBanwordsTab()
  bindAuditTab()

  await activateTab('users')
})

/**
 * Supabase 세션 + profiles.is_admin 검증.
 * @returns {Promise<{ id: string, email: string, is_admin: boolean } | null>}
 */
async function ensureAdmin() {
  const { data: sessionData, error: sessionErr } = await supabase.auth.getSession()
  if (sessionErr) throw new Error(sessionErr.message)
  const session = sessionData?.session
  if (!session?.user?.id) return null

  const { data: profile, error: profileErr } = await supabase
    .from('profiles')
    .select('id, email, is_admin')
    .eq('id', session.user.id)
    .maybeSingle()
  if (profileErr) throw new Error(profileErr.message)
  if (!profile) return null
  if (profile.is_admin !== true) return null
  return { id: profile.id, email: profile.email, is_admin: true }
}

function redirectToLogin(message) {
  showGate(message || '로그인이 필요합니다.', 'error')
  setTimeout(() => {
    try {
      const loginUrl = chrome.runtime?.getURL?.('auth/login.html')
      if (loginUrl) window.location.replace(loginUrl)
    } catch {
      /* ignore */
    }
  }, 1500)
}

function bindGlobalEvents() {
  document.querySelector('[data-action="reload"]')?.addEventListener('click', () => {
    window.location.reload()
  })
  document.querySelectorAll('.ad-tab').forEach((btn) => {
    btn.addEventListener('click', () => activateTab(btn.dataset.tab || ''))
  })
}

async function activateTab(tabId) {
  if (!TABS.includes(tabId)) return
  document.querySelectorAll('.ad-tab').forEach((btn) => {
    const active = btn.dataset.tab === tabId
    btn.classList.toggle('is-active', active)
    btn.setAttribute('aria-selected', String(active))
  })
  document.querySelectorAll('.ad-panel').forEach((panel) => {
    const active = panel.dataset.panel === tabId
    panel.classList.toggle('is-active', active)
    if (active) panel.removeAttribute('hidden')
    else panel.setAttribute('hidden', '')
  })

  if (tabId === 'users') await loadUsers()
  else if (tabId === 'settings') await loadSettings()
  else if (tabId === 'banwords') await loadBanWords()
  else if (tabId === 'audit') await loadAudit()
}

// ─────────────────────────────────────────────────────────────
// Gate UI
// ─────────────────────────────────────────────────────────────

function showGate(text, kind) {
  if (els.gate) {
    els.gate.removeAttribute('hidden')
    els.gate.classList.toggle('ad-gate--error', kind === 'error')
  }
  if (els.main) els.main.setAttribute('hidden', '')
  if (els.gateMsg) safeText(els.gateMsg, text)
}

function hideGate() {
  if (els.gate) els.gate.setAttribute('hidden', '')
  if (els.main) els.main.removeAttribute('hidden')
}
