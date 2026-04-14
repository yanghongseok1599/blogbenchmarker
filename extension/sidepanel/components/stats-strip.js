// sidepanel/components/stats-strip.js
// 분석 결과의 수치 통계를 가로 스트립으로 표시.
//
// 예시:
//   ┌────────────────────────────────────────────────────────┐
//   │  📝  1,234자   📄  14문장   🖼 6이미지   ⏱ 약 3분          │
//   └────────────────────────────────────────────────────────┘
//
// 입력 shape (handler 의 stats):
//   {
//     charCount?: number,
//     sentenceCount?: number,
//     paragraphCount?: number,
//     imageCount?: number,
//     wordCount?: number,
//     avgSentenceLength?: number,
//     emojiCount?: number,
//   }
//
// 읽기 시간 계산:
//   한국어 평균 독서 속도 ≈ 400자/분 (Nielsen/국어학자 연구 대략치).
//   reading_min = max(1, ceil(charCount / 400))
//
// 안전 규칙:
//   - createEl / safeText 만 사용 (innerHTML 0건)
//   - 이모지는 하드코딩 UTF-8. 외부 입력 아님.
//
// BEM 클래스:
//   bm-stats-strip / __item / __icon / __value / __label / __divider

import { createEl } from '../../lib/dom-safe.js'

// ────────────────────────────────────────────────────────────
// 상수
// ────────────────────────────────────────────────────────────

const READING_CHARS_PER_MIN = 400
const NBSP = '\u00A0'

/** 표시 스펙 테이블 — 각 항목의 아이콘/라벨 정의. */
const ITEM_SPECS = Object.freeze([
  {
    key: 'charCount',
    icon: '📝',
    label: '글자수',
    suffix: '자',
    ariaName: '글자수',
    fallback: 0,
  },
  {
    key: 'sentenceCount',
    icon: '📄',
    label: '문장수',
    suffix: '문장',
    ariaName: '문장 수',
    fallback: 0,
  },
  {
    key: 'imageCount',
    icon: '🖼',
    label: '이미지',
    suffix: '개',
    ariaName: '이미지 수',
    fallback: 0,
  },
  {
    key: 'readingTime', // 파생값 — computeReadingTime() 으로 생성
    icon: '⏱',
    label: '예상 읽기',
    suffix: '분',
    ariaName: '예상 읽기 시간',
    fallback: 1,
    prefix: '약 ',
  },
])

// ────────────────────────────────────────────────────────────
// 공개 진입점
// ────────────────────────────────────────────────────────────

/**
 * 스트립 컨테이너를 만든다. stats 가 비어 있으면 "0" 으로 렌더(감추지 않음).
 *
 * @param {Record<string, number | undefined>} [stats]
 * @param {{ includeReadingTime?: boolean }} [options]
 * @returns {HTMLElement}
 */
export function createStatsStrip(stats = {}, options = {}) {
  const includeReadingTime = options.includeReadingTime !== false

  const normalized = normalizeStats(stats)

  const items = ITEM_SPECS
    .filter((spec) => spec.key !== 'readingTime' || includeReadingTime)
    .map((spec) => buildItem(spec, normalized))

  // 항목 사이 divider — 시각적 구분만 (a11y 트리에는 포함 안 함)
  const withDividers = interleaveDividers(items)

  return createEl(
    'section',
    {
      className: 'bm-stats-strip',
      role: 'group',
      'aria-label': '분석 통계 요약',
    },
    withDividers,
  )
}

/**
 * 이미 렌더된 스트립을 새 stats 로 갱신.
 * @param {HTMLElement} stripRoot
 * @param {Record<string, number | undefined>} stats
 */
export function updateStatsStrip(stripRoot, stats) {
  if (!stripRoot) return
  const normalized = normalizeStats(stats)
  for (const spec of ITEM_SPECS) {
    const item = stripRoot.querySelector(`[data-stat="${spec.key}"]`)
    if (!item) continue
    const valueEl = item.querySelector('.bm-stats-strip__value')
    if (valueEl) {
      valueEl.textContent = formatValue(spec, normalized[spec.key])
    }
    item.setAttribute(
      'aria-label',
      `${spec.ariaName} ${formatValue(spec, normalized[spec.key])}`,
    )
  }
}

// 진단용
export const __internals = Object.freeze({
  READING_CHARS_PER_MIN,
  computeReadingTime,
  normalizeStats,
  formatNumber,
})

// ────────────────────────────────────────────────────────────
// 내부
// ────────────────────────────────────────────────────────────

/**
 * @param {typeof ITEM_SPECS[number]} spec
 * @param {Record<string, number>} values
 */
function buildItem(spec, values) {
  const value = values[spec.key]
  const icon = createEl(
    'span',
    { className: 'bm-stats-strip__icon', 'aria-hidden': 'true' },
    [spec.icon],
  )
  const valueEl = createEl(
    'strong',
    { className: 'bm-stats-strip__value' },
    [formatValue(spec, value)],
  )
  const labelEl = createEl(
    'span',
    { className: 'bm-stats-strip__label' },
    [spec.label],
  )

  return createEl(
    'div',
    {
      className: 'bm-stats-strip__item',
      'data-stat': spec.key,
      role: 'listitem',
      'aria-label': `${spec.ariaName} ${formatValue(spec, value)}`,
    },
    [icon, valueEl, labelEl],
  )
}

/**
 * 아이템 사이에 divider 스팬을 삽입. a11y 트리에서는 숨김.
 * @param {HTMLElement[]} items
 */
function interleaveDividers(items) {
  const out = []
  for (let i = 0; i < items.length; i++) {
    out.push(items[i])
    if (i < items.length - 1) {
      out.push(
        createEl(
          'span',
          { className: 'bm-stats-strip__divider', 'aria-hidden': 'true' },
          [NBSP],
        ),
      )
    }
  }
  return out
}

/**
 * stats 에서 필요한 필드를 뽑고 기본값/파생값을 채운다.
 * @param {Record<string, unknown>} stats
 */
function normalizeStats(stats) {
  const src = (stats && typeof stats === 'object') ? stats : {}

  const num = (v, fallback) => {
    const n = Number(v)
    return Number.isFinite(n) && n >= 0 ? Math.round(n) : fallback
  }

  const charCount = num(src.charCount, 0)
  const sentenceCount = num(src.sentenceCount, 0)
  const paragraphCount = num(src.paragraphCount, 0)
  const imageCount = num(src.imageCount, 0)
  const wordCount = num(src.wordCount, 0)

  return {
    charCount,
    sentenceCount,
    paragraphCount,
    imageCount,
    wordCount,
    readingTime: computeReadingTime(charCount),
  }
}

/**
 * 글자수 기반 읽기 시간 계산. 최소 1분 보장.
 * @param {number} charCount
 */
function computeReadingTime(charCount) {
  const n = Number(charCount)
  if (!Number.isFinite(n) || n <= 0) return 1
  return Math.max(1, Math.ceil(n / READING_CHARS_PER_MIN))
}

/**
 * 항목 값을 "약 3분" / "1,234자" 등으로 포맷.
 * @param {typeof ITEM_SPECS[number]} spec
 * @param {number} value
 */
function formatValue(spec, value) {
  if (value == null || !Number.isFinite(Number(value))) value = spec.fallback
  const pretty = formatNumber(value)
  return `${spec.prefix ?? ''}${pretty}${spec.suffix ?? ''}`
}

/**
 * 1234 → "1,234". 한국어 locale 기반. 실패 시 String() 폴백.
 * @param {number} n
 */
function formatNumber(n) {
  try {
    return new Intl.NumberFormat('ko-KR').format(Number(n) || 0)
  } catch {
    return String(n || 0)
  }
}
