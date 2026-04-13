// extension/sidepanel/components/bar-chart.js
// 의존성 0 SVG 바 차트. createElementNS 만 사용(innerHTML / insertAdjacentHTML 전면 금지).
//
// 사용:
//   import { createBarChart } from './bar-chart.js'
//   const svg = createBarChart({ data: [{label:'A', value:10}, ...], height: 200 })
//   container.appendChild(svg)

import { safeText } from '../../lib/dom-safe.js'

const SVG_NS = 'http://www.w3.org/2000/svg'

/**
 * SVG 요소 안전 생성. 속성은 문자열/숫자/null. null 은 제외.
 * @param {string} tag
 * @param {Record<string, string | number | null | undefined>} [attrs]
 * @returns {SVGElement}
 */
function svgEl(tag, attrs = {}) {
  const el = document.createElementNS(SVG_NS, tag)
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null) continue
    el.setAttribute(k, String(v))
  }
  return el
}

/**
 * 색상 선택: value 가 maxValue 대비 비율에 따라.
 * ≥70% good, ≥40% fair, 그 외 poor.
 */
function pickBarColor(value, maxValue) {
  if (maxValue <= 0) return '#94a3b8'
  const ratio = value / maxValue
  if (ratio >= 0.7) return '#16a34a'
  if (ratio >= 0.4) return '#ca8a04'
  return '#dc2626'
}

/**
 * @typedef {{ label: string, value: number }} BarDatum
 * @typedef {{
 *   data: Array<BarDatum>,
 *   height?: number,       // 기본 200
 *   width?: number,        // viewBox width, 기본 320 (responsive는 width="100%")
 *   maxValue?: number,     // y축 상한 — 미지정 시 데이터 최댓값
 *   showValues?: boolean,  // 기본 true
 *   barColor?: string,     // 미지정 시 pickBarColor 사용
 *   title?: string         // 접근성 <title>
 * }} BarChartOptions
 */

/**
 * SVG 바 차트를 생성해 반환.
 * 반응형: width="100%" + viewBox 사용 — 부모 컨테이너에 맞춰 가로 스케일.
 * @param {BarChartOptions} options
 * @returns {SVGSVGElement}
 */
export function createBarChart(options) {
  const {
    data = [],
    height = 200,
    width = 320,
    maxValue: maxValueOpt,
    showValues = true,
    barColor,
    title,
  } = options || {}

  const svg = /** @type {SVGSVGElement} */ (svgEl('svg', {
    xmlns: SVG_NS,
    width: '100%',
    height,
    viewBox: `0 0 ${width} ${height}`,
    preserveAspectRatio: 'none',
    role: 'img',
    'aria-label': title || '바 차트',
    class: 'bm-chart bm-chart--bar',
  }))

  if (title) {
    const t = svgEl('title')
    safeText(/** @type {any} */ (t), title)
    svg.appendChild(t)
  }

  if (!Array.isArray(data) || data.length === 0) {
    const emptyText = svgEl('text', {
      x: width / 2,
      y: height / 2,
      'text-anchor': 'middle',
      'dominant-baseline': 'middle',
      fill: '#94a3b8',
      'font-size': 12,
    })
    safeText(/** @type {any} */ (emptyText), '데이터 없음')
    svg.appendChild(emptyText)
    return svg
  }

  // 레이아웃 여백
  const PAD_X = 12
  const PAD_TOP = 16
  const PAD_BOTTOM = 28  // 라벨 공간
  const chartW = width - PAD_X * 2
  const chartH = height - PAD_TOP - PAD_BOTTOM

  // 스케일
  let maxVal = Number.isFinite(maxValueOpt) ? /** @type {number} */ (maxValueOpt) : 0
  if (!maxVal) {
    for (const d of data) {
      const v = Number(d?.value) || 0
      if (v > maxVal) maxVal = v
    }
    if (maxVal <= 0) maxVal = 1
  }

  // 축선
  const axis = svgEl('line', {
    x1: PAD_X,
    y1: height - PAD_BOTTOM,
    x2: width - PAD_X,
    y2: height - PAD_BOTTOM,
    stroke: '#e2e8f0',
    'stroke-width': 1,
  })
  svg.appendChild(axis)

  // 바 그리기
  const gap = 4
  const barW = Math.max(2, (chartW - gap * (data.length - 1)) / data.length)

  data.forEach((d, i) => {
    const value = Number(d?.value) || 0
    const label = String(d?.label ?? '')
    const barH = Math.max(0, Math.round((value / maxVal) * chartH))
    const x = PAD_X + i * (barW + gap)
    const y = height - PAD_BOTTOM - barH
    const fill = barColor || pickBarColor(value, maxVal)

    // 바
    const rect = svgEl('rect', {
      x,
      y,
      width: barW,
      height: barH,
      fill,
      rx: 2,
      ry: 2,
    })
    // hover tooltip 대체: <title>
    const rectTitle = svgEl('title')
    safeText(/** @type {any} */ (rectTitle), `${label}: ${value}`)
    rect.appendChild(rectTitle)
    svg.appendChild(rect)

    // 값 텍스트
    if (showValues && barH > 0) {
      const valText = svgEl('text', {
        x: x + barW / 2,
        y: Math.max(PAD_TOP + 10, y - 4),
        'text-anchor': 'middle',
        fill: '#0f172a',
        'font-size': 10,
        'font-weight': 600,
      })
      safeText(/** @type {any} */ (valText), String(value))
      svg.appendChild(valText)
    }

    // 라벨
    const lblText = svgEl('text', {
      x: x + barW / 2,
      y: height - PAD_BOTTOM + 14,
      'text-anchor': 'middle',
      fill: '#475569',
      'font-size': 10,
    })
    safeText(/** @type {any} */ (lblText), label)
    svg.appendChild(lblText)
  })

  return svg
}
