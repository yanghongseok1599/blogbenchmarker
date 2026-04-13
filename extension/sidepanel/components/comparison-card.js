// extension/sidepanel/components/comparison-card.js
// "내 글 vs 경쟁 글" 나란히 비교 카드.
// 입력 shape: _workspace/analyzer_result_shape.md 참조 — { totalScore, stats, sections } 일부 사용.
// 차이(delta) 계산 후 색상/화살표로 우열 표시. innerHTML 금지.

import { createEl, safeText } from '../../lib/dom-safe.js'

/**
 * @typedef {{
 *   title?: string,
 *   url?: string,
 *   totalScore?: number,
 *   stats?: {
 *     charCount?: number,
 *     imageCount?: number,
 *     wordCount?: number,
 *     paragraphCount?: number,
 *     avgSentenceLength?: number
 *   },
 *   topKeywords?: Array<string | { word: string, count?: number }>,
 *   hookType?: string
 * }} ScoreData
 *
 * @typedef {{
 *   mine: ScoreData | null,
 *   competitor: ScoreData | null,
 *   labels?: { mine?: string, competitor?: string }  // 헤더 라벨 커스터마이즈
 * }} ComparisonOptions
 */

const METRICS = [
  { key: 'totalScore', label: '종합 점수', higherIsBetter: true, format: (v) => Math.round(v) },
  { key: 'charCount', label: '글자 수', higherIsBetter: true, format: (v) => Math.round(v).toLocaleString('ko-KR') },
  { key: 'imageCount', label: '이미지 수', higherIsBetter: true, format: (v) => Math.round(v) },
  { key: 'paragraphCount', label: '단락 수', higherIsBetter: true, format: (v) => Math.round(v) },
  { key: 'avgSentenceLength', label: '평균 문장 길이', higherIsBetter: false, format: (v) => (Math.round(v * 10) / 10).toString() },
]

/** ScoreData 에서 지표 값 추출. 없으면 null. */
function pickMetric(data, key) {
  if (!data) return null
  if (key === 'totalScore') {
    return typeof data.totalScore === 'number' ? data.totalScore : null
  }
  const stats = data.stats || {}
  return typeof stats[key] === 'number' ? stats[key] : null
}

/** delta 문자열 + 방향. 좋음/나쁨은 higherIsBetter 에 따라. */
function computeDelta(mineVal, compVal, higherIsBetter) {
  if (mineVal == null || compVal == null) {
    return { text: '-', state: 'neutral', arrow: '' }
  }
  const diff = mineVal - compVal
  if (diff === 0) return { text: '±0', state: 'neutral', arrow: '=' }
  const better = higherIsBetter ? diff > 0 : diff < 0
  const arrow = diff > 0 ? '▲' : '▼'
  const abs = Math.abs(diff)
  const text = `${arrow} ${Math.round(abs * 10) / 10}`
  return { text, state: better ? 'good' : 'poor', arrow }
}

function formatTopKeywords(list) {
  if (!Array.isArray(list) || list.length === 0) return []
  return list
    .map((k) => {
      if (typeof k === 'string') return k
      if (k && typeof k === 'object') return String(k.word ?? '')
      return ''
    })
    .filter(Boolean)
    .slice(0, 5)
}

function renderSide(data, labelText) {
  const side = createEl('div', { className: 'bm-compare__side' })

  const header = createEl('header', { className: 'bm-compare__side-header' }, [
    createEl('p', { className: 'bm-compare__side-label' }, labelText),
    createEl('h3', { className: 'bm-compare__side-title' }, String(data?.title ?? '(제목 없음)')),
  ])
  side.appendChild(header)

  // 종합 점수 강조
  const score = pickMetric(data, 'totalScore')
  side.appendChild(
    createEl('div', { className: 'bm-compare__score' }, [
      createEl('span', { className: 'bm-compare__score-label' }, '종합 점수'),
      createEl('span', { className: 'bm-compare__score-value' }, score == null ? '—' : String(Math.round(score))),
    ]),
  )

  // 지표 목록 (totalScore 제외)
  const list = createEl('dl', { className: 'bm-compare__metrics' })
  for (const m of METRICS) {
    if (m.key === 'totalScore') continue
    const v = pickMetric(data, m.key)
    list.appendChild(createEl('dt', { className: 'bm-compare__metric-key' }, m.label))
    list.appendChild(
      createEl('dd', { className: 'bm-compare__metric-val' }, v == null ? '—' : m.format(v)),
    )
  }
  side.appendChild(list)

  // 후킹 유형
  const hook = data?.hookType ? String(data.hookType) : null
  if (hook) {
    side.appendChild(
      createEl('p', { className: 'bm-compare__hook' }, [
        createEl('span', { className: 'bm-compare__hook-label' }, '후킹 유형: '),
        createEl('span', { className: 'bm-compare__hook-value' }, hook),
      ]),
    )
  }

  // 상위 키워드
  const kws = formatTopKeywords(data?.topKeywords)
  if (kws.length > 0) {
    const ul = createEl('ul', { className: 'bm-compare__keywords' })
    for (const k of kws) ul.appendChild(createEl('li', { className: 'bm-compare__keyword' }, k))
    side.appendChild(createEl('div', { className: 'bm-compare__keywords-wrap' }, [
      createEl('p', { className: 'bm-compare__keywords-label' }, '상위 키워드'),
      ul,
    ]))
  }

  return side
}

function renderDeltaRow(mine, competitor) {
  const table = createEl('div', { className: 'bm-compare__delta' })

  table.appendChild(createEl('p', { className: 'bm-compare__delta-title' }, '차이(내 글 − 경쟁 글)'))

  const grid = createEl('dl', { className: 'bm-compare__delta-grid' })

  for (const m of METRICS) {
    const mv = pickMetric(mine, m.key)
    const cv = pickMetric(competitor, m.key)
    const { text, state } = computeDelta(mv, cv, m.higherIsBetter)

    grid.appendChild(createEl('dt', { className: 'bm-compare__delta-key' }, m.label))
    grid.appendChild(
      createEl(
        'dd',
        { className: `bm-compare__delta-val bm-compare__delta-val--${state}` },
        text,
      ),
    )
  }

  table.appendChild(grid)
  return table
}

/**
 * 비교 카드 생성.
 * @param {ComparisonOptions} options
 * @returns {HTMLElement}
 */
export function createComparisonCard(options) {
  const { mine = null, competitor = null, labels = {} } = options || {}

  const root = createEl('article', {
    className: 'bm-compare',
    'aria-label': '내 글 vs 경쟁 글 비교',
  })

  const grid = createEl('div', { className: 'bm-compare__grid' }, [
    renderSide(mine, labels.mine || '내 글'),
    renderSide(competitor, labels.competitor || '경쟁 글'),
  ])
  root.appendChild(grid)

  // 최소 한쪽이라도 데이터가 있으면 delta 표시
  if (mine || competitor) {
    root.appendChild(renderDeltaRow(mine, competitor))
  } else {
    root.appendChild(
      createEl('p', { className: 'bm-compare__empty' }, '비교할 데이터가 없습니다.'),
    )
  }

  return root
}

// 내보낼 수 있는 선언적 shape 검증 유틸 (선택적 사용)
export function isScoreData(x) {
  if (!x || typeof x !== 'object') return false
  if (typeof x.totalScore !== 'number' && !x.stats) return false
  return true
}
