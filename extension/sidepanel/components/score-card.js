// sidepanel/components/score-card.js
// 섹션 점수 카드. 분석 탭 대시보드에서 N개 그리드로 배치된다.
//
// Props:
//   createScoreCard({
//     title: string,
//     score: number,          // 0~100
//     maxScore?: number,      // 섹션 만점 (표시 용, 기본 100)
//     recommendations?: string[],
//   })
//
// 시각 구조:
//   ┌─────────────────────┐
//   │ 제목 SEO        [●]   │  ← 좌측 제목, 우측 미니 원형 게이지(숫자 포함)
//   │ ─────────────       │
//   │ 권장사항 (첫 2개)     │  ← "더 보기" 토글로 나머지 확장
//   │   • 제목 길이…         │
//   │   • 숫자 추가…         │
//   │ [ + 더 보기 (3) ]     │
//   └─────────────────────┘
//
// 구현:
//   - 우측의 미니 원형 게이지는 SVG <circle> 2개 (createElementNS 직접).
//   - 색상 구간:
//       85+  → excellent (녹색)
//       70+  → good      (인디고)
//       50+  → fair      (노랑)
//       <50  → poor      (빨강)
//   - 기본 표시 2개. 3번째부터 <details>/<summary> 로 접기/펼치기.
//   - 호버 elevation 은 CSS 전용 (JS 관여 없음).
//
// 안전 규칙:
//   - 외부/사용자 문자열은 textContent 경로로만 삽입 (dom-safe.safeText / createEl 자식 문자열).

import { createEl, safeText } from '../../lib/dom-safe.js'

// ────────────────────────────────────────────────────────────
// 상수
// ────────────────────────────────────────────────────────────

const SVG_NS = 'http://www.w3.org/2000/svg'

/** 카드 내부 미니 게이지의 고정 크기 (panel.css 와 동기화). */
const MINI_GAUGE = Object.freeze({
  radius: 22,
  stroke: 5,
  padding: 4,
})

/** 기본 표시할 추천 개수 — 나머지는 "더 보기" 뒤로. */
const DEFAULT_VISIBLE_RECS = 2

// ────────────────────────────────────────────────────────────
// 공개 진입점
// ────────────────────────────────────────────────────────────

/**
 * @typedef ScoreCardProps
 * @property {string} title 섹션 제목 (예: '제목 SEO')
 * @property {number} score 0~100
 * @property {number} [maxScore] 섹션 만점 — 예: titleSeo=20. 표시 전용.
 * @property {string[]} [recommendations]
 * @property {string} [sectionKey] 분석 섹션 key (CSS hook — 예: 'titleSeo')
 * @property {number} [visibleRecs] 기본 표시 추천 개수 (기본 2)
 */

/**
 * 점수 카드.
 * @param {ScoreCardProps} props
 * @returns {HTMLElement}
 */
export function createScoreCard(props) {
  const title = String(props?.title ?? '제목 없음')
  const score = clampScore(props?.score)
  const maxScore = Number.isFinite(Number(props?.maxScore))
    ? Math.max(0, Number(props.maxScore))
    : 100
  const recs = normalizeRecs(props?.recommendations)
  const sectionKey = typeof props?.sectionKey === 'string' ? props.sectionKey : ''
  const visible = Math.max(0, Number(props?.visibleRecs) || DEFAULT_VISIBLE_RECS)

  const colorKey = colorForScore(score)

  const titleEl = createEl('h3', { className: 'bm-score-card__title' }, [title])
  const scoreBadge = createEl(
    'span',
    { className: 'bm-score-card__max', 'aria-hidden': 'true' },
    [formatMaxLabel(score, maxScore)],
  )
  const titleBlock = createEl('div', { className: 'bm-score-card__title-block' }, [
    titleEl,
    scoreBadge,
  ])

  const miniGauge = buildMiniGauge(score, colorKey)

  const header = createEl('header', { className: 'bm-score-card__header' }, [
    titleBlock,
    miniGauge,
  ])

  const children = [header]
  if (recs.length > 0) {
    children.push(buildRecommendationsBlock(recs, visible))
  } else {
    children.push(
      createEl(
        'p',
        { className: 'bm-score-card__no-recs' },
        ['이 섹션은 개선 사항이 없습니다.'],
      ),
    )
  }

  const cardClassName = [
    'bm-score-card',
    'bm-score-card--glass',
    `bm-score-card--${colorKey}`,
    sectionKey ? `bm-score-card--${sectionKey}` : '',
  ].filter(Boolean).join(' ')

  return createEl(
    'article',
    {
      className: cardClassName,
      'data-score': String(Math.round(score)),
      'data-color': colorKey,
      'data-section': sectionKey,
      'data-variant': 'glass',
      'aria-label': `${title} ${Math.round(score)}점 (만점 ${maxScore})`,
      tabindex: '0',
    },
    children,
  )
}

// 진단용
export const __internals = Object.freeze({
  colorForScore,
  clampScore,
  buildMiniGauge,
  DEFAULT_VISIBLE_RECS,
})

// ────────────────────────────────────────────────────────────
// 색상 / 점수 매핑
// ────────────────────────────────────────────────────────────

/**
 * score → 색상 키. 5구간 매핑:
 *   85+ excellent, 70+ good, 50+ fair, <50 poor.
 *   (total-score-gauge 의 등급 테이블과 별개 — 카드는 더 coarse 한 4단계)
 * @param {number} score
 * @returns {'excellent' | 'good' | 'fair' | 'poor'}
 */
function colorForScore(score) {
  if (score >= 85) return 'excellent'
  if (score >= 70) return 'good'
  if (score >= 50) return 'fair'
  return 'poor'
}

function clampScore(v) {
  const n = Number(v)
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.min(100, n))
}

/**
 * 점수/만점 라벨 — 섹션 만점이 100 이 아니면 "12 / 20" 형태.
 * @param {number} score
 * @param {number} maxScore
 */
function formatMaxLabel(score, maxScore) {
  if (maxScore === 100 || maxScore <= 0) return '/ 100'
  // 만점을 실제 할당 점수로 환산해 표시 (예: 100점 만점 게이지 + "/ 20" 보조 라벨)
  return `/ ${Math.round(maxScore)}`
}

// ────────────────────────────────────────────────────────────
// 미니 원형 게이지 (카드 헤더 우측)
// ────────────────────────────────────────────────────────────

/**
 * 작은 원형 진행 표시. 중앙에 숫자 포함.
 * @param {number} score
 * @param {string} colorKey
 */
function buildMiniGauge(score, colorKey) {
  const { radius, stroke, padding } = MINI_GAUGE
  const size = radius * 2 + stroke + padding * 2
  const cx = size / 2
  const cy = size / 2
  const circumference = 2 * Math.PI * radius
  const dashOffset = circumference * (1 - score / 100)

  const svg = svgEl('svg', {
    class: 'bm-score-card__gauge',
    viewBox: `0 0 ${size} ${size}`,
    width: String(size),
    height: String(size),
    role: 'img',
    'aria-hidden': 'true',
    focusable: 'false',
  })
  svg.appendChild(
    svgEl('circle', {
      class: 'bm-score-card__gauge-track',
      cx: String(cx),
      cy: String(cy),
      r: String(radius),
      fill: 'none',
      'stroke-width': String(stroke),
    }),
  )
  svg.appendChild(
    svgEl('circle', {
      class: `bm-score-card__gauge-fill bm-score-card__gauge-fill--${colorKey}`,
      cx: String(cx),
      cy: String(cy),
      r: String(radius),
      fill: 'none',
      'stroke-width': String(stroke),
      'stroke-linecap': 'round',
      transform: `rotate(-90 ${cx} ${cy})`,
      'stroke-dasharray': String(circumference),
      'stroke-dashoffset': String(dashOffset),
    }),
  )

  // 중앙 점수 숫자 — HTML 로 오버레이 (SVG 텍스트 사용 안 함, 폰트 제어 편의)
  const scoreText = createEl(
    'span',
    { className: `bm-score-card__gauge-value bm-score-card__gauge-value--${colorKey}` },
    [String(Math.round(score))],
  )

  return createEl(
    'div',
    {
      className: 'bm-score-card__gauge-wrap',
      'data-circumference': String(circumference),
    },
    [svg, scoreText],
  )
}

// ────────────────────────────────────────────────────────────
// 추천사항 블록 (접기/펼치기)
// ────────────────────────────────────────────────────────────

/**
 * 추천 목록. `visible` 개까지는 항상 보이고, 초과분은 <details> 로 접힘.
 * @param {string[]} recs
 * @param {number} visible
 */
function buildRecommendationsBlock(recs, visible) {
  const head = recs.slice(0, visible)
  const tail = recs.slice(visible)

  const headList = createEl(
    'ul',
    { className: 'bm-score-card__rec-list', 'aria-label': '주요 권장사항' },
    head.map((r) =>
      createEl('li', { className: 'bm-score-card__rec-item' }, [String(r)]),
    ),
  )

  if (tail.length === 0) {
    return createEl('div', { className: 'bm-score-card__recs' }, [headList])
  }

  const tailList = createEl(
    'ul',
    { className: 'bm-score-card__rec-list bm-score-card__rec-list--tail' },
    tail.map((r) =>
      createEl('li', { className: 'bm-score-card__rec-item' }, [String(r)]),
    ),
  )
  const summary = createEl('summary', { className: 'bm-score-card__more' }, [
    `+ 더 보기 (${tail.length})`,
  ])

  const details = createEl(
    'details',
    { className: 'bm-score-card__rec-more' },
    [summary, tailList],
  )

  return createEl('div', { className: 'bm-score-card__recs' }, [headList, details])
}

/**
 * @param {unknown} raw
 * @returns {string[]}
 */
function normalizeRecs(raw) {
  if (!Array.isArray(raw)) return []
  return raw
    .map((r) => (typeof r === 'string' ? r : ''))
    .map((s) => s.trim())
    .filter(Boolean)
}

// ────────────────────────────────────────────────────────────
// SVG createElementNS 헬퍼
// ────────────────────────────────────────────────────────────

function svgEl(tag, attrs = {}, children = []) {
  const el = document.createElementNS(SVG_NS, tag)
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue
    el.setAttribute(k, String(v))
  }
  const list = Array.isArray(children) ? children : [children]
  for (const c of list) {
    if (c == null || c === false) continue
    if (c instanceof Node) el.appendChild(c)
    else el.appendChild(document.createTextNode(String(c)))
  }
  return el
}

// ────────────────────────────────────────────────────────────
// (주) safeText 는 외부 진입점에서 직접 사용하지는 않지만,
// 업데이트 경로 (updateScoreCard) 확장 시 사용할 수 있도록 미리 import 해둔다.
// ────────────────────────────────────────────────────────────
void safeText
