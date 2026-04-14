// extension/payments/checkout.js
// 결제 시작 페이지 (Phase 8.2).
//
// 설계 결정 (근거: _workspace/8.2_payment_summary.md):
//   PG 위젯 스크립트(js.tosspayments.com / cdn.portone.io)는 MV3 CSP(script-src 'self') 로
//   확장 내부에 직접 로드할 수 없다. 외부 호스팅된 결제 랜딩 페이지를 **새 탭**으로 여는 방식을
//   채택한다. 이 방식은 (a) manifest CSP 완화 불필요, (b) Chrome Web Store 심사 리스크 감소,
//   (c) 3DS/간편결제 리디렉트 처리가 자연스러움, 의 이점이 있다.
//
// 흐름:
//   1) plan 선택 + gateway 선택
//   2) orderId = crypto.randomUUID() 생성 (재시도 방지)
//   3) 외부 결제 랜딩 URL 에 쿼리스트링으로 { plan, gateway, userId, orderId } 전달
//   4) chrome.tabs.create({ url }) 로 새 탭 오픈
//   5) 결제 성공 후 랜딩 페이지가 /functions/v1/verify-subscription (mode=confirm) 호출
//   6) 실패/취소 시 사용자가 다시 이 페이지로 돌아와 재시도
//
// 실제 외부 랜딩 URL 은 env-config 또는 app_settings 로 주입 (아래 BILLING_URL 기본값 참조).

import { getCurrentUser } from '../lib/supabase-client.js'
import { createEl, safeText, clearAndAppend } from '../lib/dom-safe.js'

// 운영값은 app_settings.billing_url 로 override 가능 (009 마이그레이션에서 INSERT).
// 게이트웨이는 트레이너 마일스톤(trainer_milestone) 단일.
const DEFAULT_BILLING_URL = 'https://trainermilestone.com/checkout'
const GATEWAY = 'trainer_milestone'

const PLANS = [
  { id: 'pro',       name: 'PRO',       price: 9900,  desc: '일일 무제한 AI 생성 · 10개 블로그 모니터링' },
  { id: 'unlimited', name: 'UNLIMITED', price: 29900, desc: 'PRO 혜택 + 무제한 학습 데이터 · 우선 지원' },
]

let selectedPlan = 'pro'

document.addEventListener('DOMContentLoaded', () => {
  renderPlans()
  const btn = document.querySelector('[data-action="proceed-checkout"]')
  btn?.addEventListener('click', handleProceed)
})

function renderPlans() {
  const root = document.querySelector('[data-role="plans"]')
  if (!root) return

  const cards = PLANS.map((plan) => {
    const input = /** @type {HTMLInputElement} */ (createEl('input', {
      type: 'radio',
      name: 'plan',
      value: plan.id,
      checked: plan.id === selectedPlan ? 'checked' : null,
      onChange: () => { selectedPlan = plan.id },
    }))
    return createEl('label', { className: 'bm-checkout__plan' }, [
      input,
      createEl('div', { className: 'bm-checkout__plan-body' }, [
        createEl('h3', { className: 'bm-checkout__plan-name' }, [plan.name]),
        createEl('p', { className: 'bm-checkout__plan-price' }, [`${plan.price.toLocaleString()}원 / 월`]),
        createEl('p', { className: 'bm-checkout__plan-desc' }, [plan.desc]),
      ]),
    ])
  })
  clearAndAppend(root, ...cards)
}

async function handleProceed() {
  const statusEl = document.querySelector('[data-role="status"]')
  hide(statusEl)

  try {
    const user = await getCurrentUser()
    if (!user) {
      showStatus(statusEl, '로그인이 필요합니다.', 'error')
      return
    }

    const gateway = GATEWAY
    const plan = selectedPlan
    if (!['pro', 'unlimited'].includes(plan)) {
      showStatus(statusEl, '플랜을 선택해 주세요.', 'error')
      return
    }

    const orderId = cryptoRandomOrderId(user.id)
    const billingUrl = await resolveBillingUrl()
    const url = new URL(billingUrl)
    url.searchParams.set('plan', plan)
    url.searchParams.set('gateway', gateway)
    url.searchParams.set('userId', user.id)
    url.searchParams.set('orderId', orderId)
    // 성공/실패 URL 은 외부 랜딩이 자체 관리 — 여기선 전달만.
    url.searchParams.set('returnTo', 'chrome-extension')

    // 새 탭으로 이동. chrome.tabs 가 없는 환경(옵션 페이지 등)에서는 window.open 폴백.
    if (chrome?.tabs?.create) {
      chrome.tabs.create({ url: url.toString() })
    } else {
      window.open(url.toString(), '_blank', 'noopener,noreferrer')
    }

    showStatus(statusEl, '새 탭에서 결제를 진행해 주세요.', 'info')
  } catch (err) {
    showStatus(statusEl, err?.message || '결제 페이지 이동에 실패했습니다.', 'error')
  }
}

/**
 * 간단한 랜덤 orderId. userId 앞 8자 + 타임스탬프 + 난수.
 * 서버측이 진짜 orderId 를 다시 발급할 수 있으므로 클라이언트 값은 참고용.
 */
function cryptoRandomOrderId(userId) {
  const rand = crypto.getRandomValues(new Uint32Array(2))
  return `bm_${userId.slice(0, 8)}_${Date.now().toString(36)}_${rand[0].toString(36)}${rand[1].toString(36)}`
}

/**
 * billing URL 해석. app_settings.billing_url 이 있으면 사용, 없으면 기본값.
 */
async function resolveBillingUrl() {
  try {
    const { supabase } = await import('../lib/supabase-client.js')
    const { data, error } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'billing_url')
      .maybeSingle()
    if (!error && typeof data?.value === 'string') return data.value
    if (!error && typeof data?.value?.url === 'string') return data.value.url
  } catch { /* fall through */ }
  return DEFAULT_BILLING_URL
}

function showStatus(el, text, kind) {
  if (!el) return
  el.className = `bm-checkout__status bm-checkout__status--${kind}`
  safeText(el, text)
  el.removeAttribute('hidden')
}

function hide(el) { if (el) el.setAttribute('hidden', '') }
