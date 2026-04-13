// extension/sidepanel/tabs/mypage-tab.js
// 사이드패널 '마이' 탭 컨트롤러. mypage.html 의 축소판.
// panel.js 가 탭 활성화 시 `mount(container)` 를 호출한다.
//
// 규칙: innerHTML 금지. repository 경유.

import { safeText, clearAndAppend, createEl } from '../../lib/dom-safe.js'
import { getSession } from '../../lib/supabase-client.js'
import { getProfile } from '../../lib/repositories/user-repo.js'
import {
  getMonthlyUsage,
  computeMonthlyRatio,
} from '../../lib/repositories/usage-repo.js'
import {
  getActivePlan,
  getExpiryInfo,
} from '../../lib/repositories/subscription-repo.js'
import { createUsageGauge } from '../components/usage-gauge.js'
import { renderExpiryBannerInto } from '../components/expiry-banner.js'

const TEMPLATE_URL = '/sidepanel/tabs/mypage-tab.html'
const PLAN_LABELS = { free: '무료', pro: 'PRO', unlimited: '무제한' }

function $(scope, id) {
  return scope.querySelector(`#${id}`)
}

function formatDate(iso) {
  if (!iso) return '—'
  try {
    const d = new Date(iso)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  } catch (_) { return '—' }
}

async function loadTemplate() {
  // chrome.runtime.getURL 로 절대 경로 획득 — 상대 경로는 content script 주입 시 다르게 해석된다.
  const url = chrome.runtime.getURL('sidepanel/tabs/mypage-tab.html')
  const res = await fetch(url)
  if (!res.ok) throw new Error(`template load failed: ${res.status}`)
  const html = await res.text()

  // innerHTML 금지 → DOMParser 로 파싱(파싱 시점에는 HTML 문자열을 해석하지만
  // 대상 document 에 스크립트를 삽입하지 않는다. 외부 HTML 을 로드하지 않으며
  // 본 fetch 대상은 extension 자원(고정 경로)이므로 XSS 벡터가 아니다).
  const parsed = new DOMParser().parseFromString(html, 'text/html')
  const root = parsed.body.firstElementChild
  if (!root) throw new Error('template empty')
  return /** @type {HTMLElement} */ (document.importNode(root, true))
}

function showError(root, text) {
  const el = root.querySelector('#bm-mypage-error')
  if (!el) return
  safeText(el, text)
  el.removeAttribute('hidden')
}

function clearError(root) {
  const el = root.querySelector('#bm-mypage-error')
  if (!el) return
  safeText(el, '')
  el.setAttribute('hidden', '')
}

function renderProfile(root, profile) {
  const avatar = $(root, 'bm-mypage-avatar')
  const name = $(root, 'bm-mypage-name')
  const email = $(root, 'bm-mypage-email')
  const displayName = profile?.display_name || (profile?.email ? profile.email.split('@')[0] : '사용자')
  if (avatar) safeText(avatar, (displayName[0] || '?').toUpperCase())
  if (name) safeText(name, displayName)
  if (email) safeText(email, profile?.email || '')
}

function renderPlan(root, profile, activeSub, expiry) {
  const plan = profile?.plan || activeSub?.plan || 'free'
  const planEl = $(root, 'bm-mypage-plan')
  const expiryEl = $(root, 'bm-mypage-expiry-date')
  const statusEl = $(root, 'bm-mypage-status')

  if (planEl) {
    planEl.setAttribute('data-plan', plan)
    safeText(planEl, PLAN_LABELS[plan] || plan)
  }
  if (expiryEl) {
    if (plan === 'free') safeText(expiryEl, '해당 없음')
    else if (!expiry?.endsAt) safeText(expiryEl, '무기한')
    else safeText(expiryEl, `${formatDate(expiry.endsAt)} (D-${expiry.daysUntilExpiry ?? '?'})`)
  }
  if (statusEl) {
    const s = activeSub?.status
    const label = s === 'active' ? '활성' : s === 'cancelled' ? '해지 예약' : s === 'expired' ? '만료됨' : s === 'refunded' ? '환불됨' : plan === 'free' ? '무료' : '—'
    safeText(statusEl, label)
  }
}

function renderGauge(root, plan, usage) {
  const slot = $(root, 'bm-mypage-gauge')
  if (!slot) return
  const { limit, percent, isUnlimited } = computeMonthlyRatio(usage, plan)
  const gauge = createUsageGauge({
    usage, limit, percent, isUnlimited,
    label: '이번 달 사용량',
  })
  clearAndAppend(slot, gauge)
}

function bindActions(root, onRefresh) {
  const openBtn = $(root, 'bm-mypage-open')
  const refreshBtn = $(root, 'bm-mypage-refresh')

  if (openBtn) {
    openBtn.addEventListener('click', () => {
      try {
        chrome.tabs.create({ url: chrome.runtime.getURL('mypage/mypage.html') })
      } catch (err) {
        console.warn('[mypage-tab] chrome.tabs.create failed')
        showError(root, '전체 보기 페이지를 열 수 없습니다.')
      }
    })
  }
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      onRefresh().catch((e) => {
        console.warn('[mypage-tab] refresh failed')
        showError(root, '새로고침에 실패했습니다.')
      })
    })
  }
}

async function loadData(root) {
  clearError(root)
  let session
  try { session = await getSession() } catch (err) {
    showError(root, '세션을 확인할 수 없습니다.')
    return
  }
  const userId = session?.user?.id
  if (!userId) {
    showError(root, '로그인이 필요합니다.')
    return
  }

  const [profileRes, subRes, expiryRes, usageRes] = await Promise.allSettled([
    getProfile(userId),
    getActivePlan(userId),
    getExpiryInfo(userId),
    getMonthlyUsage(userId),
  ])

  const profile = profileRes.status === 'fulfilled' ? profileRes.value : null
  const activeSub = subRes.status === 'fulfilled' ? subRes.value : null
  const expiry = expiryRes.status === 'fulfilled' ? expiryRes.value : null
  const usage = usageRes.status === 'fulfilled' ? usageRes.value : 0

  if (profile) renderProfile(root, profile)
  else renderProfile(root, { email: session.user?.email, display_name: null })

  renderPlan(root, profile, activeSub, expiry)
  renderGauge(root, profile?.plan || activeSub?.plan || 'free', usage)

  const expirySlot = $(root, 'bm-mypage-expiry')
  if (expirySlot && expiry) {
    await renderExpiryBannerInto(expirySlot, {
      info: expiry,
      dismissible: true,
      onUpgrade: () => {
        try { chrome.tabs.create({ url: chrome.runtime.getURL('mypage/mypage.html') + '#pricing' }) }
        catch (_) { /* noop */ }
      },
    })
  }

  const failedParts = []
  if (profileRes.status === 'rejected') failedParts.push('프로필')
  if (subRes.status === 'rejected') failedParts.push('구독')
  if (expiryRes.status === 'rejected') failedParts.push('만료')
  if (usageRes.status === 'rejected') failedParts.push('사용량')
  if (failedParts.length > 0) showError(root, `일부 정보 로드 실패: ${failedParts.join(', ')}`)
}

/**
 * panel.js 가 탭 활성화 시 호출한다.
 * @param {HTMLElement} container  탭 대상 컨테이너(빈 패널)
 * @returns {Promise<{ destroy: () => void }>}
 */
export async function mount(container) {
  if (!container) throw new Error('mypage-tab: container 필요')

  // 템플릿 로드 + 주입
  let root
  try {
    root = await loadTemplate()
  } catch (err) {
    console.warn('[mypage-tab] template load failed')
    const fallback = createEl('div', { className: 'bm-mypage__error', role: 'alert' }, '마이페이지를 불러올 수 없습니다.')
    clearAndAppend(container, fallback)
    return { destroy: () => clearAndAppend(container) }
  }
  clearAndAppend(container, root)

  const refresh = () => loadData(root)
  bindActions(root, refresh)
  await refresh()

  return {
    destroy: () => clearAndAppend(container),
  }
}

export const TEMPLATE_PATH = TEMPLATE_URL
