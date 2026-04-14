// sidepanel/components/recommendation-list.js
// 추천사항 (seo-analyzer 의 global recommendations) 목록을
// 카테고리 + 우선순위로 그룹핑해 보여주는 컴포넌트.
//
// 입력:
//   createRecommendationList(
//     recommendations: string[],
//     { sections?: Array<{ key, title, score }> }
//   )
//
// 분류 로직:
//   1) 한국어 키워드 매칭으로 5개 카테고리 중 하나에 배정
//      (제목 / 후킹 / 본문 / 가독성 / 키워드)
//   2) 해당 카테고리의 섹션 점수가 있으면 점수 기반 우선순위
//      score < 50  → high
//      score < 75  → medium
//      score >= 75 → low
//      (점수 없으면 medium 기본값)
//
// 안전 규칙:
//   - 추천 문자열은 모두 textContent 로만 삽입 (innerHTML 금지)
//   - 카테고리/우선순위는 내부 열거형 — 외부 입력이 아님

import { createEl } from '../../lib/dom-safe.js'

// ────────────────────────────────────────────────────────────
// 상수
// ────────────────────────────────────────────────────────────

/** 카테고리 표시 순서 + 한국어 라벨 + 아이콘. */
const CATEGORY_SPECS = Object.freeze([
  { key: 'title',       label: '제목',     icon: '🏷',  sectionKey: 'titleSeo' },
  { key: 'hook',        label: '후킹',     icon: '🎯',  sectionKey: 'hookScore' },
  { key: 'content',     label: '본문',     icon: '📖',  sectionKey: 'contentSeo' },
  { key: 'readability', label: '가독성',   icon: '👓',  sectionKey: 'readability' },
  { key: 'keyword',     label: '키워드',   icon: '🔑',  sectionKey: 'keywordDensity' },
  { key: 'misc',        label: '기타',     icon: '💡',  sectionKey: null },
])

/** 우선순위 정렬 순서 — 표시 시 high → medium → low. */
const PRIORITY_ORDER = Object.freeze({ high: 0, medium: 1, low: 2 })

/** 한국어 키워드 → 카테고리 매핑. 순서 중요 — 먼저 매칭되는 것 채택. */
const CATEGORY_KEYWORDS = Object.freeze([
  { cat: 'title',       patterns: ['제목', '타이틀', '헤드라인'] },
  { cat: 'hook',        patterns: ['첫 문장', '첫문장', '후킹', '도입', '인트로'] },
  { cat: 'keyword',     patterns: ['키워드', '단어', '태그', '해시태그'] },
  { cat: 'readability', patterns: ['문장이', '문장 길이', '평균 문장', '이모지', '읽기', '가독'] },
  { cat: 'content',     patterns: ['이미지', '문단', '단락', '본문', '신뢰', '출처', '수치', '예시', '경험'] },
])

/** "짧습니다" / "권장" 등 심각도 힌트 — high 판정 가산점. */
const SEVERITY_HINTS = Object.freeze({
  high: ['너무', '과도', '초과', '이상이어야', '짧습니다', '길다', '깁니다', '금지'],
  low:  ['권장', '고려', '가산', '올라갑'],
})

// ────────────────────────────────────────────────────────────
// 공개 진입점
// ────────────────────────────────────────────────────────────

/**
 * 추천사항 목록 컴포넌트.
 *
 * @param {string[]} recommendations seo-analyzer 의 top-level `recommendations`
 * @param {{ sections?: Array<{ key?: string, score?: number }> }} [options]
 * @returns {HTMLElement}
 */
export function createRecommendationList(recommendations, options = {}) {
  const items = normalizeInput(recommendations).map((text) =>
    classify(text, options.sections),
  )

  if (items.length === 0) {
    return createEl(
      'section',
      { className: 'bm-recs bm-recs--empty', role: 'region', 'aria-label': '추천사항' },
      [
        createEl('p', { className: 'bm-recs__empty-text' }, [
          '🎉 추천사항이 없습니다. 훌륭한 글이에요!',
        ]),
      ],
    )
  }

  const byCategory = groupBy(items, (i) => i.category)
  const groups = CATEGORY_SPECS
    .filter((spec) => Array.isArray(byCategory.get(spec.key)) && byCategory.get(spec.key).length > 0)
    .map((spec) => buildGroup(spec, byCategory.get(spec.key)))

  const header = createEl('header', { className: 'bm-recs__head' }, [
    createEl('h3', { className: 'bm-recs__title' }, ['추천사항']),
    createEl('span', { className: 'bm-recs__count' }, [
      `${items.length}개`,
    ]),
  ])

  return createEl(
    'section',
    {
      className: 'bm-recs',
      role: 'region',
      'aria-label': '추천사항 목록',
      'data-count': String(items.length),
    },
    [header, ...groups],
  )
}

// 진단용
export const __internals = Object.freeze({
  classify,
  categoryOf,
  priorityOf,
  CATEGORY_SPECS,
  CATEGORY_KEYWORDS,
})

// ────────────────────────────────────────────────────────────
// 분류 로직
// ────────────────────────────────────────────────────────────

/**
 * @param {string} text
 * @param {Array<{ key?: string, score?: number }>} [sections]
 * @returns {{ text: string, category: string, priority: string }}
 */
function classify(text, sections) {
  const category = categoryOf(text)
  const priority = priorityOf(text, category, sections)
  return { text, category, priority }
}

/**
 * 추천 문구에서 카테고리를 뽑는다. 매칭 없으면 'misc'.
 * @param {string} text
 */
function categoryOf(text) {
  const s = String(text || '')
  for (const row of CATEGORY_KEYWORDS) {
    for (const p of row.patterns) {
      if (s.includes(p)) return row.cat
    }
  }
  return 'misc'
}

/**
 * 우선순위 판정:
 *   1) 섹션 점수가 주어지면 섹션 점수 기반 (high < 50, medium < 75, low 75+)
 *   2) 심각도 힌트 단어가 있으면 가중
 *   3) 둘 다 없으면 medium
 * @param {string} text
 * @param {string} category
 * @param {Array<{ key?: string, score?: number }> | undefined} sections
 */
function priorityOf(text, category, sections) {
  const spec = CATEGORY_SPECS.find((s) => s.key === category)
  const sectionKey = spec?.sectionKey ?? null

  let base = 'medium'
  if (sectionKey && Array.isArray(sections)) {
    const found = sections.find((s) => s?.key === sectionKey)
    if (found && Number.isFinite(Number(found.score))) {
      const score = Number(found.score)
      if (score < 50) base = 'high'
      else if (score < 75) base = 'medium'
      else base = 'low'
    }
  }

  const lower = String(text || '')
  if (SEVERITY_HINTS.high.some((k) => lower.includes(k))) {
    base = base === 'low' ? 'medium' : 'high'
  } else if (SEVERITY_HINTS.low.some((k) => lower.includes(k))) {
    if (base === 'medium') base = 'low'
  }
  return base
}

// ────────────────────────────────────────────────────────────
// 렌더 — 그룹 / 항목
// ────────────────────────────────────────────────────────────

/**
 * 단일 카테고리 블록. <details> 로 접기/펼치기 (카테고리당 3개 초과 시 유용).
 * 기본은 open — 숨기고 싶으면 추후 옵션화.
 * @param {typeof CATEGORY_SPECS[number]} spec
 * @param {Array<{ text: string, priority: string }>} items
 */
function buildGroup(spec, items) {
  const sorted = items.slice().sort(
    (a, b) => (PRIORITY_ORDER[a.priority] ?? 9) - (PRIORITY_ORDER[b.priority] ?? 9),
  )

  const summary = createEl(
    'summary',
    { className: 'bm-recs__group-summary' },
    [
      createEl(
        'span',
        { className: 'bm-recs__group-icon', 'aria-hidden': 'true' },
        [spec.icon],
      ),
      createEl('span', { className: 'bm-recs__group-label' }, [spec.label]),
      createEl('span', { className: 'bm-recs__group-count' }, [
        `${sorted.length}건`,
      ]),
    ],
  )

  const listChildren = sorted.map(buildItem)
  const list = createEl(
    'ul',
    {
      className: 'bm-recs__list',
      role: 'list',
      'aria-label': `${spec.label} 추천사항 ${sorted.length}건`,
    },
    listChildren,
  )

  return createEl(
    'details',
    {
      className: `bm-recs__group bm-recs__group--${spec.key}`,
      open: '',
      'data-category': spec.key,
    },
    [summary, list],
  )
}

/**
 * 단일 추천 항목. 우선순위 태그 + 본문.
 * @param {{ text: string, priority: string }} item
 */
function buildItem({ text, priority }) {
  const priorityTag = createEl(
    'span',
    {
      className: `bm-recs__priority bm-recs__priority--${priority}`,
      role: 'note',
      'aria-label': priorityAriaLabel(priority),
    },
    [priorityLabel(priority)],
  )
  const body = createEl('span', { className: 'bm-recs__text' }, [String(text || '')])
  return createEl(
    'li',
    {
      className: `bm-recs__item bm-recs__item--${priority}`,
      'data-priority': priority,
    },
    [priorityTag, body],
  )
}

function priorityLabel(priority) {
  switch (priority) {
    case 'high':   return '중요'
    case 'low':    return '참고'
    case 'medium':
    default:       return '권장'
  }
}

function priorityAriaLabel(priority) {
  return `우선순위: ${priorityLabel(priority)}`
}

// ────────────────────────────────────────────────────────────
// 유틸
// ────────────────────────────────────────────────────────────

/**
 * @param {unknown} raw
 * @returns {string[]}
 */
function normalizeInput(raw) {
  if (!Array.isArray(raw)) return []
  return raw
    .map((v) => (typeof v === 'string' ? v : ''))
    .map((s) => s.trim())
    .filter(Boolean)
}

/**
 * @template T
 * @param {T[]} arr
 * @param {(item: T) => string} keyFn
 * @returns {Map<string, T[]>}
 */
function groupBy(arr, keyFn) {
  const map = new Map()
  for (const item of arr) {
    const k = keyFn(item)
    const list = map.get(k)
    if (list) list.push(item)
    else map.set(k, [item])
  }
  return map
}
