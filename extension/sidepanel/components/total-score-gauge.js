// sidepanel/components/total-score-gauge.js
// 총점 원형 게이지 — 분석 탭 상단의 히어로 영역.
//
// Props:
//   createTotalScoreGauge(score, { label?, subtitle?, radius?, stroke? })
//
// 시각 구조:
//   ┌──────────────────────┐
//   │     ╭──────╮  ┌───┐   │
//   │    │  84    │  │ A │   │  ← 큰 숫자 + 등급 배지
//   │    │ 총점    │  └───┘   │
//   │     ╰──────╯          │
//   │  블로그 SEO              │  ← subtitle
//   └──────────────────────┘
//
// 구현 원칙:
//   - SVG 는 document.createElementNS('http://www.w3.org/2000/svg', …) 만 사용.
//   - HTML 조립은 dom-safe.createEl / safeText 로만 (외부 문자열 XSS 차단).
//   - innerHTML / outerHTML / insertAdjacentHTML 사용 0건 (grep 검증).
//
// 클래스 네이밍(BEM): bm-gauge / bm-gauge__ring / __svg / __track / __progress /
//                     __center / __score / __label / __grade / __grade-letter / __subtitle

import { createEl, safeText } from '../../lib/dom-safe.js'

// ────────────────────────────────────────────────────────────
// 상수
// ────────────────────────────────────────────────────────────

const SVG_NS = 'http://www.w3.org/2000/svg'

const DEFAULTS = Object.freeze({
  radius: 80,    // 원의 반지름 (px)
  stroke: 12,    // 링 두께
  padding: 8,    // viewBox 여백 (stroke 가 잘리지 않도록)
})

/**
 * 점수 → 등급 테이블 (프로젝트 전역 기준).
 *   S: 90+, A: 80+, B: 70+, C: 60+, D: 이하
 * colorKey 는 panel.css 의 색상 변수와 매칭된다:
 *   excellent / good / fair / warn / poor
 */
const GRADE_TABLE = Object.freeze([
  { min: 90, grade: 'S', colorKey: 'excellent' },
  { min: 80, grade: 'A', colorKey: 'good' },
  { min: 70, grade: 'B', colorKey: 'fair' },
  { min: 60, grade: 'C', colorKey: 'warn' },
  { min: 0,  grade: 'D', colorKey: 'poor' },
])

// ────────────────────────────────────────────────────────────
// 공개 진입점
// ────────────────────────────────────────────────────────────

/**
 * 총점 원형 게이지 카드를 생성한다.
 *
 * @param {number} rawScore 0~100.
 * @param {{ label?: string, subtitle?: string, radius?: number, stroke?: number }} [options]
 * @returns {HTMLElement}
 */
export function createTotalScoreGauge(rawScore, options = {}) {
  const score = clampScore(rawScore)
  const label = typeof options.label === 'string' ? options.label : '총점'
  const subtitle = typeof options.subtitle === 'string' ? options.subtitle : '블로그 SEO'
  const radius = Number(options.radius) > 0 ? Number(options.radius) : DEFAULTS.radius
  const stroke = Number(options.stroke) > 0 ? Number(options.stroke) : DEFAULTS.stroke

  const { grade, colorKey } = resolveGrade(score)
  const geom = computeGeometry(radius, stroke, score)

  const svg = buildSvg(geom, colorKey, score)
  const center = createEl('div', { className: 'bm-gauge__center' }, [
    createEl('strong', { className: 'bm-gauge__score' }, [String(Math.round(score))]),
    createEl('span', { className: 'bm-gauge__label' }, [label]),
  ])
  const ring = createEl('div', { className: 'bm-gauge__ring' }, [svg, center])
  const gradeBadge = createEl(
    'div',
    {
      className: `bm-gauge__grade bm-gauge__grade--${colorKey}`,
      'aria-hidden': 'true',
    },
    [
      createEl('span', { className: 'bm-gauge__grade-letter' }, [grade]),
      createEl('span', { className: 'bm-gauge__grade-caption' }, ['등급']),
    ],
  )
  const head = createEl('div', { className: 'bm-gauge__head' }, [ring, gradeBadge])
  const subtitleEl = createEl('p', { className: 'bm-gauge__subtitle' }, [subtitle])

  return createEl(
    'section',
    {
      className: `bm-gauge bm-gauge--glass bm-gauge--${colorKey}`,
      role: 'group',
      'aria-label': `${label} ${Math.round(score)}점, 등급 ${grade}`,
      'data-score': String(Math.round(score)),
      'data-grade': grade,
      'data-circumference': String(geom.circumference),
      'data-variant': 'glass',
    },
    [head, subtitleEl],
  )
}

/**
 * 이미 렌더된 gauge 를 새 점수로 업데이트.
 * 전체 재생성 없이 값만 갱신할 때 사용 (애니메이션 트리거 용이).
 *
 * @param {HTMLElement} gaugeRoot createTotalScoreGauge() 반환값
 * @param {number} nextScore
 */
export function updateTotalScoreGauge(gaugeRoot, nextScore) {
  if (!gaugeRoot) return
  const score = clampScore(nextScore)
  const { grade, colorKey } = resolveGrade(score)

  gaugeRoot.setAttribute('data-score', String(Math.round(score)))
  gaugeRoot.setAttribute('data-grade', grade)
  gaugeRoot.className = `bm-gauge bm-gauge--glass bm-gauge--${colorKey}`
  gaugeRoot.setAttribute('aria-label', `총점 ${Math.round(score)}점, 등급 ${grade}`)

  // 원형 진행 offset 업데이트
  const circumference = Number(gaugeRoot.getAttribute('data-circumference')) || 0
  const progress = gaugeRoot.querySelector('.bm-gauge__progress')
  if (progress && circumference > 0) {
    const offset = circumference * (1 - score / 100)
    progress.setAttribute('stroke-dashoffset', String(offset))
    progress.setAttribute(
      'class',
      `bm-gauge__progress bm-gauge__progress--${colorKey}`,
    )
    progress.setAttribute('data-progress', String(Math.round(score)))
  }

  // 중앙 숫자
  const scoreEl = gaugeRoot.querySelector('.bm-gauge__score')
  if (scoreEl) safeText(scoreEl, String(Math.round(score)))

  // 등급 배지
  const gradeLetter = gaugeRoot.querySelector('.bm-gauge__grade-letter')
  if (gradeLetter) safeText(gradeLetter, grade)
  const gradeBadge = gaugeRoot.querySelector('.bm-gauge__grade')
  if (gradeBadge) gradeBadge.className = `bm-gauge__grade bm-gauge__grade--${colorKey}`
}

// 진단/테스트 편의용 공개 (내부 로직 직접 검증 시)
export const __internals = Object.freeze({
  clampScore,
  resolveGrade,
  computeGeometry,
  GRADE_TABLE,
})

// ────────────────────────────────────────────────────────────
// SVG 조립
// ────────────────────────────────────────────────────────────

/**
 * SVG 루트 + 배경 트랙 + 진행 circle.
 * @param {ReturnType<typeof computeGeometry>} geom
 * @param {string} colorKey
 * @param {number} score
 */
function buildSvg(geom, colorKey, score) {
  const { size, cx, cy, r, stroke, circumference, dashOffset } = geom

  const svg = svgEl('svg', {
    class: 'bm-gauge__svg',
    viewBox: `0 0 ${size} ${size}`,
    width: String(size),
    height: String(size),
    role: 'img',
    'aria-hidden': 'true', // 부모 섹션의 aria-label 이 이미 설명
    focusable: 'false',
  })

  const trackCircle = svgEl('circle', {
    class: 'bm-gauge__track',
    cx: String(cx),
    cy: String(cy),
    r: String(r),
    fill: 'none',
    'stroke-width': String(stroke),
  })

  const progressCircle = svgEl('circle', {
    class: `bm-gauge__progress bm-gauge__progress--${colorKey}`,
    cx: String(cx),
    cy: String(cy),
    r: String(r),
    fill: 'none',
    'stroke-width': String(stroke),
    'stroke-linecap': 'round',
    // 12시 방향부터 시계방향으로 증가하게 rotate.
    transform: `rotate(-90 ${cx} ${cy})`,
    'stroke-dasharray': String(circumference),
    'stroke-dashoffset': String(dashOffset),
    'data-progress': String(Math.round(score)),
  })

  svg.appendChild(trackCircle)
  svg.appendChild(progressCircle)
  return svg
}

// ────────────────────────────────────────────────────────────
// Geometry / 등급 판정
// ────────────────────────────────────────────────────────────

/**
 * 기하 계산. stroke 가 잘리지 않도록 padding 을 viewBox 여백에 반영.
 * @param {number} radius
 * @param {number} stroke
 * @param {number} score
 */
function computeGeometry(radius, stroke, score) {
  const r = Math.max(20, Number(radius) || DEFAULTS.radius)
  const s = Math.max(2, Number(stroke) || DEFAULTS.stroke)
  const size = r * 2 + s + DEFAULTS.padding * 2
  const cx = size / 2
  const cy = size / 2
  const circumference = 2 * Math.PI * r
  const ratio = Math.max(0, Math.min(1, Number(score) / 100))
  const dashOffset = circumference * (1 - ratio)
  return { size, cx, cy, r, stroke: s, circumference, dashOffset }
}

/**
 * @param {number} score
 * @returns {{ grade: string, colorKey: string }}
 */
function resolveGrade(score) {
  for (const row of GRADE_TABLE) {
    if (score >= row.min) return { grade: row.grade, colorKey: row.colorKey }
  }
  return { grade: 'D', colorKey: 'poor' }
}

function clampScore(v) {
  const n = Number(v)
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.min(100, n))
}

// ────────────────────────────────────────────────────────────
// SVG createElementNS 헬퍼 (파일-로컬)
// ────────────────────────────────────────────────────────────

/**
 * SVG 전용 엘리먼트 생성기.
 * dom-safe.createEl 은 HTML 네임스페이스 전용이라 SVG 에 사용 불가.
 *
 * @param {string} tag
 * @param {Record<string, string>} [attrs]
 * @param {Array<Node | string>} [children]
 * @returns {SVGElement}
 */
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
