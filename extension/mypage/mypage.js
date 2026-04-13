// extension/mypage/mypage.js
// 마이페이지 로직 — 프로필/플랜/사용량/만료 알림을 Supabase 에서 가져와 렌더.
// 규칙:
//   - DB 접근은 repository 경유. supabase 클라이언트 직접 호출 금지.
//   - innerHTML 금지. 모든 DOM 갱신은 dom-safe.createEl / safeText.
//   - 사용자 친화 에러 메시지. Supabase 원문은 console 에만.

import { createEl, safeText, clearAndAppend } from '../lib/dom-safe.js'
import { getSession } from '../lib/supabase-client.js'
import { getProfile } from '../lib/repositories/user-repo.js'
import {
  getMonthlyUsage,
  getFeatureBreakdown,
  computeMonthlyRatio,
  MONTHLY_LIMITS,
} from '../lib/repositories/usage-repo.js'
import {
  getActivePlan,
  getExpiryInfo,
} from '../lib/repositories/subscription-repo.js'
import { createUsageGauge } from '../sidepanel/components/usage-gauge.js'
import { renderExpiryBannerInto } from '../sidepanel/components/expiry-banner.js'

const FEATURE_LABELS = {
  generate_content: 'AI 글 생성',
  analyze_seo: 'SEO 분석',
  benchmark_fetch: '벤치마크 수집',
  extract_youtube: 'YouTube 자막 추출',
  unknown: '기타',
}

const PLAN_LABELS = { free: '무료', pro: 'PRO', unlimited: '무제한' }

function $(id) { return document.getElementById(id) }

function formatDate(iso) {
  if (!iso) return '—'
  try {
    const d = new Date(iso)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  } catch (_) {
    return '—'
  }
}

function showError(text) {
  const slot = $('bbmp-error-slot')
  if (!slot) return
  clearAndAppend(
    slot,
    createEl('div', { className: 'bbmp-error', role: 'alert' }, text),
  )
}

function clearError() {
  const slot = $('bbmp-error-slot')
  if (slot) clearAndAppend(slot)
}

function renderProfile(profile) {
  const avatar = $('bbmp-avatar')
  const name = $('bbmp-name')
  const email = $('bbmp-email')
  const joined = $('bbmp-joined')

  const displayName = profile?.display_name || (profile?.email ? profile.email.split('@')[0] : '사용자')
  const initial = (displayName[0] || '?').toUpperCase()

  if (avatar) safeText(avatar, initial)
  if (name) safeText(name, displayName)
  if (email) safeText(email, profile?.email || '')
  if (joined) safeText(joined, profile?.created_at ? `가입일: ${formatDate(profile.created_at)}` : '')
}

function renderPlanCard(profile, activeSub, expiry) {
  const badge = $('bbmp-plan-badge')
  const status = $('bbmp-plan-status')
  const expiryEl = $('bbmp-plan-expiry')
  const gatewayEl = $('bbmp-plan-gateway')

  const plan = profile?.plan || activeSub?.plan || 'free'
  if (badge) {
    safeText(badge, PLAN_LABELS[plan] || plan)
    badge.setAttribute('data-plan', plan)
  }

  let statusText = '무료 플랜'
  if (activeSub) {
    const s = activeSub.status
    statusText = s === 'active' ? '활성' : s === 'cancelled' ? '해지 예약' : s === 'expired' ? '만료됨' : s === 'refunded' ? '환불됨' : s
  } else if (plan !== 'free') {
    statusText = '활성(수동)'
  }
  if (status) safeText(status, statusText)

  let expiryText = '—'
  if (plan === 'free') expiryText = '해당 없음'
  else if (!expiry?.endsAt) expiryText = '무기한'
  else expiryText = `${formatDate(expiry.endsAt)} (D-${Number.isFinite(expiry.daysUntilExpiry) ? expiry.daysUntilExpiry : '?'})`
  if (expiryEl) safeText(expiryEl, expiryText)

  const gatewayLabels = { toss: '토스페이먼츠', portone: '포트원', null: '—' }
  if (gatewayEl) safeText(gatewayEl, gatewayLabels[activeSub?.gateway] ?? (activeSub ? '미지정' : '—'))
}

function renderGauge(plan, usage) {
  const slot = $('bbmp-gauge-slot')
  if (!slot) return
  const { limit, percent, isUnlimited } = computeMonthlyRatio(usage, plan)
  const gauge = createUsageGauge({
    usage,
    limit,
    percent,
    isUnlimited,
    label: '이번 달 사용량',
    note: isUnlimited
      ? '무제한 플랜입니다. 자유롭게 사용해 주세요.'
      : `${PLAN_LABELS[plan] || plan} 플랜 한도`,
  })
  clearAndAppend(slot, gauge)
}

function renderBreakdown(rows) {
  const body = $('bbmp-breakdown-body')
  if (!body) return

  if (!rows || rows.length === 0) {
    clearAndAppend(
      body,
      createEl(
        'tr',
        {},
        createEl('td', { colSpan: '3', className: 'bbmp-empty' }, '최근 30일 사용 내역이 없습니다.'),
      ),
    )
    return
  }

  const trs = rows.map((r) => {
    const label = FEATURE_LABELS[r.feature] || r.feature
    return createEl('tr', {}, [
      createEl('td', {}, label),
      createEl('td', { className: 'bbmp-table__num' }, String(r.count ?? 0)),
      createEl('td', { className: 'bbmp-table__num' }, String(r.costTokens ?? 0)),
    ])
  })
  clearAndAppend(body, ...trs)
}

function openPricingTab() {
  // Phase 8.2 에서 결제 페이지 URL이 확정될 때까지 placeholder.
  try {
    chrome.tabs.create({ url: chrome.runtime.getURL('mypage/mypage.html') + '#pricing' })
  } catch (_) { /* noop */ }
}

async function loadAndRender() {
  clearError()

  let session
  try {
    session = await getSession()
  } catch (err) {
    console.warn('[mypage] getSession failed:', err?.message)
    showError('세션을 확인할 수 없습니다. 다시 로그인해 주세요.')
    return
  }

  const userId = session?.user?.id
  if (!userId) {
    showError('로그인이 필요합니다.')
    return
  }

  // 병렬 로드 — 실패한 항목만 부분 경고.
  const [profileRes, subRes, expiryRes, usageRes, breakdownRes] = await Promise.allSettled([
    getProfile(userId),
    getActivePlan(userId),
    getExpiryInfo(userId),
    getMonthlyUsage(userId),
    getFeatureBreakdown(userId),
  ])

  const profile = profileRes.status === 'fulfilled' ? profileRes.value : null
  const activeSub = subRes.status === 'fulfilled' ? subRes.value : null
  const expiry = expiryRes.status === 'fulfilled' ? expiryRes.value : null
  const usage = usageRes.status === 'fulfilled' ? usageRes.value : 0
  const breakdown = breakdownRes.status === 'fulfilled' ? breakdownRes.value : []

  if (profile) renderProfile(profile)
  else renderProfile({ email: session.user?.email, display_name: null })

  renderPlanCard(profile, activeSub, expiry)
  renderGauge(profile?.plan || activeSub?.plan || 'free', usage)
  renderBreakdown(breakdown)

  // 만료 배너
  const expirySlot = $('bbmp-expiry-slot')
  if (expirySlot && expiry) {
    await renderExpiryBannerInto(expirySlot, {
      info: expiry,
      dismissible: true,
      onUpgrade: openPricingTab,
    })
  }

  // 부분 실패 안내
  const failed = []
  if (profileRes.status === 'rejected') failed.push('프로필')
  if (subRes.status === 'rejected') failed.push('구독')
  if (expiryRes.status === 'rejected') failed.push('만료 정보')
  if (usageRes.status === 'rejected') failed.push('사용량')
  if (breakdownRes.status === 'rejected') failed.push('기능별 내역')
  if (failed.length > 0) {
    showError(`일부 데이터를 불러오지 못했습니다: ${failed.join(', ')}`)
    console.warn('[mypage] partial failures:', {
      profile: profileRes,
      sub: subRes,
      expiry: expiryRes,
      usage: usageRes,
      breakdown: breakdownRes,
    })
  }
}

function init() {
  const back = $('bbmp-back')
  if (back) {
    back.addEventListener('click', (e) => {
      e.preventDefault()
      window.close()
    })
  }
  loadAndRender()
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init)
} else {
  init()
}
