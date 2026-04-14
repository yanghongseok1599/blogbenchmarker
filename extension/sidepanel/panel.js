// sidepanel/panel.js
// 6탭 라우터 + 헤더 유저 슬롯 + 푸터 도움말.
//
// 원칙:
//   - 탭 마운트는 lazy (최초 활성화 시 1회 import). 이후는 idempotent 재호출.
//   - 각 탭 mount 함수는 시그니처가 다르므로 tabActivators 가 정규화한다.
//   - innerHTML 금지 — dom-safe.createEl / safeText 경유.
//   - 누락된 탭 모듈·mount 함수는 try-catch 로 안전 폴백(placeholder 유지).

import { createEl, safeText, clearAndAppend } from '../lib/dom-safe.js'
import { getSession, onAuthChange } from '../lib/supabase-client.js'

const APP_VERSION = '0.1.0'

// 탭 식별자 → 메타(아이콘·라벨·활성화 함수)
const TAB_META = Object.freeze([
  { id: 'analyze',   icon: '📊', labelKey: 'tab_analyze',   loader: () => import('./tabs/analyze-tab.js'),    mountName: 'mountAnalyzeTab' },
  { id: 'benchmark', icon: '🏆', labelKey: 'tab_benchmark', loader: () => import('./tabs/benchmark-tab.js'),  mountName: 'mountBenchmarkTab' },
  { id: 'generate',  icon: '✨', labelKey: 'tab_generate',  loader: () => import('./tabs/generate-tab.js'),   mountName: 'mountGenerateTab' },
  { id: 'learning',  icon: '📚', labelKey: 'tab_learning',  loader: () => import('./tabs/learning-tab.js'),   mountName: 'mountLearningTab' },
  { id: 'tools',     icon: '🛠️', labelKey: 'tab_tools',     loader: () => import('./tabs/tools-tab.js'),      mountName: 'mount' },
  { id: 'mypage',    icon: '👤', labelKey: 'tab_mypage',    loader: () => import('./tabs/mypage-tab.js'),     mountName: 'mount' },
])

const TAB_IDS = TAB_META.map((t) => t.id)
const DEFAULT_TAB = 'analyze'

// ─── 상태 ─────────────────────────────────────────────────────────────────────
/** 이미 마운트된 탭 id 집합(중복 마운트 방지). */
const mountedTabs = new Set()
/** 탭별 destroy 핸들(mount 가 { destroy } 를 반환한 경우 저장). */
const tabDisposers = new Map()

// ─── DOM 헬퍼 ─────────────────────────────────────────────────────────────────
function $(id) {
  return document.getElementById(id)
}
function qs(sel, root = document) {
  return root.querySelector(sel)
}
function qsa(sel, root = document) {
  return Array.from(root.querySelectorAll(sel))
}

// ─── 탭 활성화 ────────────────────────────────────────────────────────────────

/**
 * 탭 버튼의 aria/tabindex/클래스를 갱신.
 * @param {string} tabId
 */
function updateTabButtons(tabId) {
  for (const btn of qsa('.bm-tab')) {
    const isActive = btn.dataset.tab === tabId
    btn.classList.toggle('is-active', isActive)
    btn.setAttribute('aria-selected', String(isActive))
    btn.setAttribute('tabindex', isActive ? '0' : '-1')
  }
}

/**
 * 탭 패널의 hidden/클래스 토글. 활성 패널을 반환.
 * @param {string} tabId
 * @returns {HTMLElement | null}
 */
function updateTabPanels(tabId) {
  /** @type {HTMLElement | null} */
  let active = null
  for (const panel of qsa('.bm-panel')) {
    const isActive = panel.dataset.panel === tabId
    panel.classList.toggle('is-active', isActive)
    if (isActive) {
      panel.removeAttribute('hidden')
      active = /** @type {HTMLElement} */ (panel)
    } else {
      panel.setAttribute('hidden', '')
    }
  }
  return active
}

/**
 * lazy-mount. mount 함수 시그니처 차이(mountXxxTab vs mount)를 메타의 `mountName` 으로 흡수.
 * 반환이 { destroy } 이면 tabDisposers 에 저장.
 * @param {typeof TAB_META[number]} meta
 * @param {HTMLElement} panelEl
 */
async function mountTab(meta, panelEl) {
  if (mountedTabs.has(meta.id)) return
  mountedTabs.add(meta.id) // idempotent 보장 — 에러 시에도 재시도 방지(placeholder 유지)

  try {
    const mod = await meta.loader()
    const fn = mod?.[meta.mountName] || mod?.default?.mount
    if (typeof fn !== 'function') {
      console.warn(`[panel] ${meta.id} 탭 mount 함수(${meta.mountName}) 미존재 — placeholder 유지`)
      return
    }
    const result = await fn(panelEl)
    if (result && typeof result.destroy === 'function') {
      tabDisposers.set(meta.id, result.destroy)
    }
  } catch (err) {
    mountedTabs.delete(meta.id) // 재시도 허용(네트워크·로드 실패 등)
    console.warn(`[panel] ${meta.id} 탭 마운트 실패:`, err?.message || err)
    // placeholder 에 간단한 에러 힌트 주입(기존 텍스트 대체).
    const placeholder = panelEl.querySelector('.bm-placeholder')
    if (placeholder) {
      safeText(
        placeholder,
        `${meta.id} 탭을 불러올 수 없습니다. 네트워크를 확인하고 탭을 다시 눌러 주세요.`,
      )
    }
  }
}

/**
 * 탭 전환 엔트리. 버튼/패널 상태 갱신 + 지연 마운트 + URL hash 동기화.
 * @param {string} tabId
 * @param {{ updateHash?: boolean }} [opts]
 */
function activateTab(tabId, opts = {}) {
  const meta = TAB_META.find((t) => t.id === tabId)
  if (!meta) return

  updateTabButtons(tabId)
  const activePanel = updateTabPanels(tabId)

  if (opts.updateHash !== false) {
    // 상태 이벤트(history back 대상) 없이 조용히 동기화.
    const next = `#${tabId}`
    if (location.hash !== next) {
      try { history.replaceState(null, '', next) } catch (_) { location.hash = next }
    }
  }

  if (activePanel) {
    mountTab(meta, activePanel)
  }
}

// ─── 헤더 유저 슬롯 ──────────────────────────────────────────────────────────

function renderAvatar(user) {
  const email = user?.email || ''
  const displayName = user?.user_metadata?.display_name || (email ? email.split('@')[0] : '사용자')
  const initial = (displayName[0] || '?').toUpperCase()

  const avatar = createEl(
    'button',
    {
      type: 'button',
      className: 'bm-header__avatar',
      'aria-label': `${displayName} (${email}) — 마이페이지로 이동`,
      title: email ? `${displayName} · ${email}` : displayName,
      onClick: () => activateTab('mypage'),
    },
    initial,
  )
  return avatar
}

function renderLoginButton() {
  return createEl(
    'button',
    {
      type: 'button',
      className: 'bm-header__login',
      'aria-label': '로그인 페이지 열기',
      onClick: () => {
        try {
          chrome.tabs.create({ url: chrome.runtime.getURL('auth/login.html') })
        } catch (err) {
          console.warn('[panel] auth/login.html 열기 실패')
        }
      },
    },
    [
      createEl('span', { className: 'bm-header__login-icon', 'aria-hidden': 'true' }, '🔑'),
      createEl('span', { className: 'bm-header__login-label', 'data-i18n': 'auth_login_submit' }, '로그인'),
    ],
  )
}

async function refreshUserSlot() {
  const slot = $('bm-user-slot')
  if (!slot) return
  let session = null
  try {
    session = await getSession()
  } catch (err) {
    console.warn('[panel] getSession 실패 — 로그인 버튼으로 폴백')
  }
  const node = session?.user ? renderAvatar(session.user) : renderLoginButton()
  clearAndAppend(slot, node)
}

// ─── 푸터 ────────────────────────────────────────────────────────────────────

function initFooter() {
  const v = $('bm-footer-version')
  if (v) safeText(v, `v${APP_VERSION}`)

  const help = $('bm-help-link')
  if (!help) return
  help.addEventListener('click', (e) => {
    e.preventDefault()
    // docs/FAQ.md 는 확장 번들 외부(저장소 docs/) 에 존재. 공개 호스팅 후 URL 치환 대상.
    // 현재는 Chrome Web Store 지원 링크로 임시 이동.
    const url = chrome.runtime.getURL('mypage/mypage.html') + '#faq'
    try {
      chrome.tabs.create({ url })
    } catch (_) {
      console.info('[panel] 도움말: chrome.tabs.create 실패 — 새 탭에서 직접 열어 주세요.')
    }
  })
}

// ─── 탭 이벤트 라우팅 ────────────────────────────────────────────────────────

function handleTabClick(event) {
  const target = /** @type {HTMLElement | null} */ (event.target)
  if (!target) return
  const btn = target.closest('.bm-tab')
  if (!btn) return
  const tabId = /** @type {HTMLElement} */ (btn).dataset.tab
  if (tabId) activateTab(tabId)
}

/** 좌우 화살표로 탭 이동(a11y). */
function handleTabKeydown(event) {
  const target = /** @type {HTMLElement | null} */ (event.target)
  if (!target || !target.classList.contains('bm-tab')) return
  const key = event.key
  if (key !== 'ArrowLeft' && key !== 'ArrowRight' && key !== 'Home' && key !== 'End') return

  event.preventDefault()
  const current = target.dataset.tab
  const idx = TAB_IDS.indexOf(current)
  if (idx < 0) return

  let nextIdx = idx
  if (key === 'ArrowLeft') nextIdx = (idx - 1 + TAB_IDS.length) % TAB_IDS.length
  else if (key === 'ArrowRight') nextIdx = (idx + 1) % TAB_IDS.length
  else if (key === 'Home') nextIdx = 0
  else if (key === 'End') nextIdx = TAB_IDS.length - 1

  const nextId = TAB_IDS[nextIdx]
  activateTab(nextId)
  const nextBtn = document.getElementById(`bm-tab-${nextId}`)
  if (nextBtn) nextBtn.focus()
}

// ─── URL hash 라우팅 ────────────────────────────────────────────────────────

function tabIdFromHash() {
  const h = (location.hash || '').replace(/^#/, '').trim()
  return TAB_IDS.includes(h) ? h : null
}

function handleHashChange() {
  const id = tabIdFromHash()
  if (id) activateTab(id, { updateHash: false })
}

// ─── 부트스트랩 ──────────────────────────────────────────────────────────────

function bootstrapTabs() {
  const nav = qs('.bm-tabs')
  if (nav) {
    nav.addEventListener('click', handleTabClick)
    nav.addEventListener('keydown', handleTabKeydown)
  }

  window.addEventListener('hashchange', handleHashChange)

  const initial = tabIdFromHash() || DEFAULT_TAB
  activateTab(initial, { updateHash: false })

  // 인증 상태 변화 시 헤더 유저 슬롯 재렌더.
  try {
    onAuthChange(() => { refreshUserSlot().catch(() => {}) })
  } catch (err) {
    console.warn('[panel] onAuthChange 구독 실패')
  }
}

function init() {
  try {
    bootstrapTabs()
  } catch (err) {
    console.warn('[panel] bootstrapTabs 실패:', err?.message)
  }
  initFooter()
  refreshUserSlot().catch(() => {})
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init)
} else {
  init()
}

// 테스트/외부에서 강제 전환 가능하도록 제한된 API 노출 (window 전역 오염 없이).
export const __panel = Object.freeze({
  activateTab,
  TAB_IDS,
  refreshUserSlot,
})
