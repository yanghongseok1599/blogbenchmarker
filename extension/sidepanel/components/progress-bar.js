// sidepanel/components/progress-bar.js
// 0~100 점수를 가로 막대로 시각화한다. ARIA progressbar 역할 부여.
//
// 사용:
//   import { createProgressBar } from '../components/progress-bar.js'
//   const bar = createProgressBar(78, { label: 'SEO 점수' })
//
// 안전 규칙: 모든 DOM 구성은 dom-safe.js 의 createEl 만 사용 (chrome-extension-security §3).

import { createEl } from '../../lib/dom-safe.js'

/**
 * 점수에 따라 색상 토큰을 반환한다.
 * - 80 이상: 우수(green)
 * - 60 이상: 보통(yellow)
 * - 그 외:   미흡(red)
 * @param {number} score
 * @returns {'good' | 'fair' | 'poor'}
 */
function scoreLevel(score) {
  if (score >= 80) return 'good'
  if (score >= 60) return 'fair'
  return 'poor'
}

/**
 * 0~100 점수를 막대로 시각화하는 컴포넌트.
 * @param {number} rawScore 0~100 사이 숫자. 범위 밖이면 clamp.
 * @param {{ label?: string, showValue?: boolean }} [options]
 * @returns {HTMLElement}
 */
export function createProgressBar(rawScore, options = {}) {
  const score = Math.max(0, Math.min(100, Number(rawScore) || 0))
  const level = scoreLevel(score)
  const { label = '', showValue = true } = options

  const fill = createEl('div', {
    className: `bm-progress__fill bm-progress__fill--${level}`,
    style: { width: `${score}%` },
  })

  const track = createEl(
    'div',
    {
      className: 'bm-progress__track',
      role: 'progressbar',
      'aria-valuenow': String(score),
      'aria-valuemin': '0',
      'aria-valuemax': '100',
      'aria-label': label || `점수 ${score}`,
    },
    [fill],
  )

  const children = [track]
  if (showValue) {
    children.push(
      createEl('span', { className: 'bm-progress__value' }, [`${score}점`]),
    )
  }

  return createEl('div', { className: 'bm-progress' }, children)
}
