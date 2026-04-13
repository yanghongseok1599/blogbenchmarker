// extension/sidepanel/components/word-cloud.js
// 간단 키워드 워드클라우드. CSS Grid 배치 + font-size 5-bucket 만 사용.
// 외부 라이브러리 의존 0. innerHTML 금지 — dom-safe.createEl 사용.

import { createEl, safeText } from '../../lib/dom-safe.js'

// 5 bucket에 대응하는 font-size (px)
const FONT_SIZES = [12, 14, 17, 20, 24]
const COLORS = ['#94a3b8', '#64748b', '#475569', '#2563eb', '#1d4ed8']

/**
 * 가중치(weight) 배열로부터 각 항목의 bucket 인덱스 맵을 계산.
 * bucket 은 [min, max] 를 5등분한 구간. 최댓값은 마지막 bucket.
 * @param {Array<{text:string, weight:number}>} data
 * @returns {number[]} 길이가 data 와 같은 bucket index 배열(0~4)
 */
function computeBuckets(data) {
  if (!Array.isArray(data) || data.length === 0) return []

  let lo = Infinity
  let hi = -Infinity
  for (const d of data) {
    const w = Number(d?.weight) || 0
    if (w < lo) lo = w
    if (w > hi) hi = w
  }
  if (!Number.isFinite(lo)) lo = 0
  if (!Number.isFinite(hi)) hi = 0

  // 모든 weight 동일 → 중간 bucket(2) 통일.
  if (hi === lo) return data.map(() => 2)

  const width = (hi - lo) / FONT_SIZES.length
  return data.map((d) => {
    const w = Number(d?.weight) || 0
    let idx = Math.floor((w - lo) / width)
    if (idx >= FONT_SIZES.length) idx = FONT_SIZES.length - 1
    if (idx < 0) idx = 0
    return idx
  })
}

/**
 * @typedef {{ text: string, weight: number }} WordDatum
 * @typedef {{
 *   data: Array<WordDatum>,
 *   maxItems?: number,     // 기본 30
 *   minColumnWidth?: number // grid min column px, 기본 72
 * }} WordCloudOptions
 */

/**
 * 키워드 워드클라우드 div 를 생성해 반환.
 * @param {WordCloudOptions} options
 * @returns {HTMLDivElement}
 */
export function createWordCloud(options) {
  const { data = [], maxItems = 30, minColumnWidth = 72 } = options || {}

  const safeData = Array.isArray(data)
    ? data
        .filter((d) => d && typeof d.text === 'string' && d.text.trim().length > 0)
        .slice(0, maxItems)
    : []

  const container = /** @type {HTMLDivElement} */ (
    createEl('div', {
      className: 'bm-wordcloud',
      role: 'group',
      'aria-label': '주요 키워드',
      style: {
        display: 'grid',
        gridTemplateColumns: `repeat(auto-fill, minmax(${minColumnWidth}px, 1fr))`,
        gap: '6px 10px',
        alignItems: 'center',
        justifyItems: 'center',
        padding: '8px',
      },
    })
  )

  if (safeData.length === 0) {
    const empty = createEl('p', { className: 'bm-wordcloud__empty', style: { color: '#94a3b8', fontSize: '12px', margin: 0 } }, '키워드가 없습니다.')
    container.appendChild(empty)
    return container
  }

  const buckets = computeBuckets(safeData)

  safeData.forEach((d, i) => {
    const bucket = buckets[i] ?? 2
    const item = createEl('span', {
      className: 'bm-wordcloud__item',
      'data-bucket': String(bucket),
      title: `가중치: ${d.weight}`,
      style: {
        fontSize: `${FONT_SIZES[bucket]}px`,
        color: COLORS[bucket],
        fontWeight: bucket >= 3 ? '700' : bucket >= 2 ? '600' : '500',
        lineHeight: '1.2',
        textAlign: 'center',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        maxWidth: '100%',
      },
    })
    safeText(item, d.text)
    container.appendChild(item)
  })

  return container
}
