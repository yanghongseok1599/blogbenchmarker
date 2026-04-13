// extension/sidepanel/components/expiry-banner.js
// 구독 만료 임박 배너. 3일 이내 = warn, 1일 이내 = danger.
// 사용자가 닫으면 chrome.storage.local 에 dismiss timestamp 저장 — 동일 만료일이면 재표시하지 않는다.
// innerHTML 금지 — dom-safe.createEl 경유.

import { createEl, safeText } from '../../lib/dom-safe.js'

const STORAGE_KEY = '__bbm_expiry_banner_dismissed'

function formatDate(iso) {
  if (!iso) return ''
  try {
    const d = new Date(iso)
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  } catch (_) {
    return String(iso)
  }
}

/**
 * 현재 endsAt 을 dismiss 키로 사용해 재표시 여부 판정.
 * endsAt 이 바뀌면(재결제/연장) 자동 재표시된다.
 * @param {string | null} endsAt
 * @returns {Promise<boolean>}
 */
async function isDismissedFor(endsAt) {
  if (!endsAt) return false
  try {
    const res = await chrome.storage.local.get([STORAGE_KEY])
    const saved = res?.[STORAGE_KEY]
    if (!saved || typeof saved !== 'object') return false
    return saved.endsAt === endsAt
  } catch (_) {
    return false
  }
}

async function markDismissedFor(endsAt) {
  if (!endsAt) return
  try {
    await chrome.storage.local.set({
      [STORAGE_KEY]: { endsAt, dismissedAt: Date.now() },
    })
  } catch (_) {
    // noop — dismiss 실패해도 UI는 닫힘(다음 렌더에서 다시 나타남)
  }
}

/**
 * @typedef {Object} ExpiryInfo
 * @property {string | null} endsAt
 * @property {number | null} daysUntilExpiry
 * @property {boolean} isExpired
 * @property {boolean} willExpireSoon
 * @property {boolean} willExpireVerySoon
 * @property {'active'|'cancelled'|'expired'|'refunded'|null} status
 * @property {'free'|'pro'|'unlimited'} plan
 *
 * @typedef {{
 *   info: ExpiryInfo,
 *   dismissible?: boolean,       // 기본 true
 *   onUpgrade?: () => void,      // "연장하기" 버튼 핸들러(있으면 표시)
 *   forceShow?: boolean          // 기본 false. true 면 dismiss 무시하고 표시
 * }} ExpiryBannerOptions
 */

/**
 * 만료 배너 엘리먼트 생성.
 * 표시 조건에 안 맞거나 이미 dismiss 된 경우 null 반환.
 * @param {ExpiryBannerOptions} options
 * @returns {Promise<HTMLElement | null>}
 */
export async function createExpiryBanner(options) {
  const { info, dismissible = true, onUpgrade, forceShow = false } = options || {}

  if (!info || info.plan === 'free') return null
  if (!info.willExpireSoon && !info.isExpired) return null
  if (!forceShow && (await isDismissedFor(info.endsAt))) return null

  const state = info.isExpired
    ? 'expired'
    : info.willExpireVerySoon
      ? 'danger'
      : 'warn'

  const banner = createEl('aside', {
    className: `bm-expiry bm-expiry--${state}`,
    role: 'alert',
    'aria-live': 'polite',
  })

  const titleText = info.isExpired
    ? '구독이 만료되었습니다'
    : info.willExpireVerySoon
      ? '구독이 곧 만료됩니다 (1일 이내)'
      : `구독이 ${info.daysUntilExpiry}일 후 만료됩니다`

  banner.appendChild(createEl('p', { className: 'bm-expiry__title' }, titleText))

  const bodyText = info.isExpired
    ? '혜택이 중단되었습니다. 플랜을 다시 활성화해 주세요.'
    : info.status === 'cancelled'
      ? `해지 예약 상태입니다. ${formatDate(info.endsAt)} 까지 혜택이 유지됩니다.`
      : `만료일: ${formatDate(info.endsAt)}. 연장하지 않으면 플랜 혜택이 중단됩니다.`

  banner.appendChild(createEl('p', { className: 'bm-expiry__body' }, bodyText))

  const actions = createEl('div', { className: 'bm-expiry__actions' })

  if (typeof onUpgrade === 'function') {
    actions.appendChild(
      createEl(
        'button',
        {
          type: 'button',
          className: 'bm-expiry__cta',
          onClick: () => {
            try { onUpgrade() } catch (_) { /* noop */ }
          },
        },
        info.isExpired ? '플랜 재구독' : '지금 연장',
      ),
    )
  }

  if (dismissible && !info.isExpired) {
    actions.appendChild(
      createEl(
        'button',
        {
          type: 'button',
          className: 'bm-expiry__dismiss',
          'aria-label': '배너 닫기',
          onClick: async () => {
            await markDismissedFor(info.endsAt)
            try { banner.remove() } catch (_) { /* noop */ }
          },
        },
        '닫기',
      ),
    )
  }

  banner.appendChild(actions)
  return banner
}

/**
 * dismiss 상태를 리셋(테스트/관리자용). 프로덕션 경로에선 호출하지 않는다.
 * @returns {Promise<void>}
 */
export async function resetExpiryBannerDismiss() {
  try {
    await chrome.storage.local.remove([STORAGE_KEY])
  } catch (_) { /* noop */ }
}

/**
 * 이미 렌더된 컨테이너에 배너를 append(또는 제거)한다.
 * 동일 컨테이너 내 중복 배너 방지를 위해 기존 .bm-expiry 먼저 제거.
 * @param {HTMLElement} container
 * @param {ExpiryBannerOptions} options
 * @returns {Promise<HTMLElement | null>}
 */
export async function renderExpiryBannerInto(container, options) {
  if (!container) return null
  const existing = container.querySelector(':scope > .bm-expiry')
  if (existing) existing.remove()

  const banner = await createExpiryBanner(options)
  if (banner) {
    container.insertBefore(banner, container.firstChild)
  }
  return banner
}
