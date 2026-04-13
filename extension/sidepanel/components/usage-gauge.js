// extension/sidepanel/components/usage-gauge.js
// 사용량 게이지 — horizontal progress bar + 퍼센트 뱃지.
// bar-chart 는 카테고리 비교용이고, gauge 는 단일 값 vs 한도이므로 재사용하지 않는다.
// innerHTML 금지 — dom-safe.createEl 경유.

import { createEl, safeText } from '../../lib/dom-safe.js'

/** 비율별 색상 토큰 (CSS 클래스로 매핑 - panel.css `.bm-gauge__fill--*`). */
function pickState(percent) {
  if (percent >= 100) return 'danger'
  if (percent >= 80) return 'warn'
  if (percent >= 50) return 'fair'
  return 'good'
}

function formatCount(n) {
  if (!Number.isFinite(n)) return '—'
  return Math.round(n).toLocaleString('ko-KR')
}

/**
 * @typedef {{
 *   usage: number,
 *   limit: number,           // Infinity 이면 "무제한"
 *   percent?: number,        // 미지정 시 usage/limit*100
 *   label?: string,          // 상단 라벨 (기본 "이번 달 사용량")
 *   isUnlimited?: boolean,   // true 이면 게이지 숨기고 "무제한" 표시
 *   note?: string            // 하단 보조 문구
 * }} UsageGaugeOptions
 */

/**
 * 사용량 게이지 생성.
 * @param {UsageGaugeOptions} options
 * @returns {HTMLElement}
 */
export function createUsageGauge(options) {
  const {
    usage = 0,
    limit = 0,
    percent: percentOpt,
    label = '이번 달 사용량',
    isUnlimited: unlimitedOpt,
    note,
  } = options || {}

  const isUnlimited =
    unlimitedOpt === true || !Number.isFinite(limit) || limit === Number.POSITIVE_INFINITY

  const percent = Number.isFinite(percentOpt)
    ? Math.max(0, Math.min(100, Math.round(percentOpt)))
    : isUnlimited
      ? 0
      : limit > 0
        ? Math.max(0, Math.min(100, Math.round((usage / limit) * 100)))
        : 0

  const state = isUnlimited ? 'unlimited' : pickState(percent)

  const root = createEl('div', {
    className: 'bm-gauge',
    'data-state': state,
    role: 'group',
    'aria-label': label,
  })

  // 헤더: 라벨 + usage / limit
  root.appendChild(
    createEl('div', { className: 'bm-gauge__head' }, [
      createEl('span', { className: 'bm-gauge__label' }, label),
      isUnlimited
        ? createEl('span', { className: 'bm-gauge__count bm-gauge__count--unlimited' }, [
            createEl('strong', {}, formatCount(usage)),
            ' / 무제한',
          ])
        : createEl('span', { className: 'bm-gauge__count' }, [
            createEl('strong', {}, formatCount(usage)),
            ' / ',
            formatCount(limit),
          ]),
    ]),
  )

  if (isUnlimited) {
    root.appendChild(
      createEl(
        'p',
        { className: 'bm-gauge__note bm-gauge__note--unlimited' },
        note || '무제한 플랜을 사용하고 계십니다.',
      ),
    )
    return root
  }

  // 트랙 + 필 + ARIA
  const fill = createEl('div', {
    className: `bm-gauge__fill bm-gauge__fill--${state}`,
    style: { width: `${percent}%` },
  })
  const track = createEl(
    'div',
    {
      className: 'bm-gauge__track',
      role: 'progressbar',
      'aria-valuemin': '0',
      'aria-valuemax': '100',
      'aria-valuenow': String(percent),
      'aria-valuetext': `${percent}%`,
    },
    [fill],
  )

  root.appendChild(
    createEl('div', { className: 'bm-gauge__body' }, [
      track,
      createEl('span', { className: `bm-gauge__percent bm-gauge__percent--${state}` }, `${percent}%`),
    ]),
  )

  if (note) {
    root.appendChild(createEl('p', { className: 'bm-gauge__note' }, note))
  } else if (percent >= 100) {
    root.appendChild(
      createEl(
        'p',
        { className: 'bm-gauge__note bm-gauge__note--danger' },
        '이번 달 한도를 모두 사용했습니다.',
      ),
    )
  } else if (percent >= 80) {
    root.appendChild(
      createEl(
        'p',
        { className: 'bm-gauge__note bm-gauge__note--warn' },
        `한도의 ${percent}% 를 사용했습니다. 곧 소진됩니다.`,
      ),
    )
  }

  return root
}

/**
 * 이미 렌더된 gauge 를 퍼센트/사용량만 업데이트한다(재생성 없이).
 * @param {HTMLElement} root  createUsageGauge 가 반환한 루트
 * @param {{ usage: number, limit?: number, percent?: number }} next
 */
export function updateUsageGauge(root, next) {
  if (!root) return
  const usage = Number(next?.usage) || 0
  const limit = Number.isFinite(next?.limit) ? next.limit : NaN
  const p = Number.isFinite(next?.percent)
    ? Math.max(0, Math.min(100, Math.round(next.percent)))
    : Number.isFinite(limit) && limit > 0
      ? Math.max(0, Math.min(100, Math.round((usage / limit) * 100)))
      : 0

  const fill = root.querySelector('.bm-gauge__fill')
  const track = root.querySelector('.bm-gauge__track')
  const percentEl = root.querySelector('.bm-gauge__percent')
  const state = pickState(p)

  if (fill) {
    fill.style.width = `${p}%`
    fill.className = `bm-gauge__fill bm-gauge__fill--${state}`
  }
  if (track) {
    track.setAttribute('aria-valuenow', String(p))
    track.setAttribute('aria-valuetext', `${p}%`)
  }
  if (percentEl) {
    percentEl.className = `bm-gauge__percent bm-gauge__percent--${state}`
    safeText(percentEl, `${p}%`)
  }
  root.setAttribute('data-state', state)
}
