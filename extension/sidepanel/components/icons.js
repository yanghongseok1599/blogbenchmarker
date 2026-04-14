// sidepanel/components/icons.js
// 분석 탭 전용 인라인 SVG 아이콘 라이브러리.
//
// 설계 원칙:
//   - 외부 폰트/이미지/이모지 의존 0. 모든 아이콘은 24×24 viewBox + stroke 1.5 path.
//   - stroke="currentColor" → CSS 의 `color` 속성으로 색 제어 (theming 용이).
//   - 사용처마다 size 옵션 조절 (기본 20px — stats strip / 카드 배지 공통).
//   - createElementNS 만 사용 — innerHTML 0건.
//
// API:
//   import { icon } from './icons.js'
//   const el = icon('clock', { size: 22, className: 'bm-icon bm-icon--muted' })
//   container.appendChild(el)
//
// 아이콘 목록 (§ICON_NAMES):
//   text · paragraph · image · clock              (stats-strip)
//   tag · target · book · eye · key · lightbulb   (recommendation category)
//   sparkle · sparkles · check · search · warning · info  (상태 표시 / 빈 상태 / 에러)
//   chart-bar · trophy · book-open · wrench · user        (탭 네비게이션)

const SVG_NS = 'http://www.w3.org/2000/svg'

// ────────────────────────────────────────────────────────────
// 아이콘 레지스트리
// ────────────────────────────────────────────────────────────

/**
 * 각 아이콘은 { paths?: string[], circles?: CircleAttrs[], rects?: RectAttrs[] } 형태.
 * 순서: rect → circle → path 로 그려져 path 가 최상단.
 */
const ICONS = Object.freeze({
  // ── 통계 스트립 ──
  text: {
    paths: ['M4 7h16', 'M4 12h16', 'M4 17h10'],
  },
  paragraph: {
    paths: ['M13 4v16', 'M17 4v16', 'M9 4h8a5 5 0 010 10H9z'],
  },
  image: {
    rects: [{ x: 3, y: 3, width: 18, height: 18, rx: 2 }],
    paths: ['m21 15-5-5L5 21'],
    circles: [{ cx: 8.5, cy: 8.5, r: 1.5 }],
  },
  clock: {
    circles: [{ cx: 12, cy: 12, r: 9 }],
    paths: ['M12 7v5l3 2'],
  },

  // ── 추천 카테고리 ──
  tag: {
    paths: [
      'M20.59 13.41 13 21a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z',
    ],
    circles: [{ cx: 7, cy: 7, r: 1.2 }],
  },
  target: {
    circles: [
      { cx: 12, cy: 12, r: 9 },
      { cx: 12, cy: 12, r: 5 },
      { cx: 12, cy: 12, r: 1.6, fill: 'currentColor' },
    ],
  },
  book: {
    paths: [
      'M2 4h6a4 4 0 014 4v13a3 3 0 00-3-3H2z',
      'M22 4h-6a4 4 0 00-4 4v13a3 3 0 013-3h7z',
    ],
  },
  eye: {
    paths: ['M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z'],
    circles: [{ cx: 12, cy: 12, r: 3 }],
  },
  key: {
    circles: [{ cx: 7.5, cy: 15.5, r: 4.5 }],
    paths: ['m11 11 10-10', 'm18 4 2 2', 'm15 7 2 2'],
  },
  lightbulb: {
    paths: [
      'M9 18h6',
      'M10 22h4',
      'M12 2a7 7 0 00-4 12.7V17a1 1 0 001 1h6a1 1 0 001-1v-2.3A7 7 0 0012 2z',
    ],
  },

  // ── 상태 / 빈 상태 / 에러 ──
  sparkle: {
    paths: ['M12 3l2 7 7 2-7 2-2 7-2-7-7-2 7-2z'],
  },
  // sparkle 의 의미 alias (lucide 계열 명명과의 호환성).
  sparkles: {
    paths: ['M12 3l2 7 7 2-7 2-2 7-2-7-7-2 7-2z'],
  },
  check: {
    paths: ['M20 6 9 17l-5-5'],
  },
  search: {
    circles: [{ cx: 11, cy: 11, r: 7 }],
    paths: ['m21 21-4.3-4.3'],
  },
  warning: {
    paths: [
      'M10.29 3.86 1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z',
      'M12 9v4',
      'M12 17h.01',
    ],
  },
  info: {
    circles: [{ cx: 12, cy: 12, r: 9 }],
    paths: ['M12 16v-4', 'M12 8h.01'],
  },

  // ── 탭 네비게이션 ──
  // 분석 탭: 3개 세로 막대(높이 다름) + 수평 베이스라인.
  'chart-bar': {
    paths: [
      'M3 21h18',
      'M7 21v-8',
      'M12 21v-13',
      'M17 21v-5',
    ],
  },
  // 벤치마크 탭: 트로피 컵 + 좌우 손잡이 + 하단 받침.
  trophy: {
    paths: [
      'M8 4h8v7a4 4 0 01-8 0V4z',
      'M8 7H5a2 2 0 000 4h3',
      'M16 7h3a2 2 0 010 4h-3',
      'M12 15v4',
      'M9 21h6',
    ],
  },
  // 학습 탭: 펼쳐진 책 — 중앙 제본선 + 좌우 페이지 곡선.
  'book-open': {
    paths: [
      'M12 7v14',
      'M12 7c-2-2-5-3-9-3v13c4 0 7 1 9 3',
      'M12 7c2-2 5-3 9-3v13c-4 0-7 1-9 3',
    ],
  },
  // 도구 탭: 렌치 실루엣(대각선 Lucide 풍 단일 경로).
  wrench: {
    paths: [
      'M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z',
    ],
  },
  // 마이 탭: 사람 실루엣 — 머리(원) + 어깨/몸통(곡선).
  user: {
    circles: [{ cx: 12, cy: 8, r: 4 }],
    paths: ['M4 21v-1a7 7 0 0116 0v1'],
  },
})

/** 존재하는 아이콘 이름 셋 (타입 힌트 / 누락 감지용). */
export const ICON_NAMES = Object.freeze(Object.keys(ICONS))

// ────────────────────────────────────────────────────────────
// 공개 진입점
// ────────────────────────────────────────────────────────────

/**
 * 주어진 이름의 SVG 아이콘을 생성한다. 누락 시 점선 원 fallback + console.warn.
 *
 * @param {string} name ICON_NAMES 중 하나
 * @param {{ size?: number, className?: string, strokeWidth?: number, title?: string }} [options]
 * @returns {SVGElement}
 */
export function icon(name, options = {}) {
  const def = ICONS[name]
  const size = Number.isFinite(Number(options.size)) && Number(options.size) > 0
    ? Number(options.size)
    : 20
  const className = typeof options.className === 'string' ? options.className : 'bm-icon'
  const strokeWidth = Number.isFinite(Number(options.strokeWidth)) && Number(options.strokeWidth) > 0
    ? Number(options.strokeWidth)
    : 1.5

  if (!def) {
    console.warn(`[icons] unknown icon: ${name}`)
    return buildFallback({ size, className, strokeWidth })
  }

  const svg = svgEl('svg', {
    class: className,
    viewBox: '0 0 24 24',
    width: String(size),
    height: String(size),
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': String(strokeWidth),
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    role: 'img',
    'aria-hidden': options.title ? 'false' : 'true',
    'aria-label': options.title || null,
    focusable: 'false',
    'data-icon': name,
  })

  if (Array.isArray(def.rects)) {
    for (const r of def.rects) {
      svg.appendChild(svgEl('rect', stringifyAttrs(r)))
    }
  }
  if (Array.isArray(def.circles)) {
    for (const c of def.circles) {
      svg.appendChild(svgEl('circle', stringifyAttrs(c)))
    }
  }
  if (Array.isArray(def.paths)) {
    for (const d of def.paths) {
      svg.appendChild(svgEl('path', { d }))
    }
  }
  return svg
}

// ────────────────────────────────────────────────────────────
// Internal
// ────────────────────────────────────────────────────────────

function buildFallback({ size, className, strokeWidth }) {
  const svg = svgEl('svg', {
    class: className,
    viewBox: '0 0 24 24',
    width: String(size),
    height: String(size),
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': String(strokeWidth),
    'aria-hidden': 'true',
    focusable: 'false',
    'data-icon': 'unknown',
  })
  svg.appendChild(
    svgEl('circle', {
      cx: '12',
      cy: '12',
      r: '9',
      'stroke-dasharray': '2 2',
    }),
  )
  return svg
}

function stringifyAttrs(obj) {
  const out = {}
  for (const [k, v] of Object.entries(obj || {})) {
    if (v == null || v === false) continue
    out[k] = String(v)
  }
  return out
}

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
