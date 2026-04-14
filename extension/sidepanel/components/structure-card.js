// extension/sidepanel/components/structure-card.js
// 블로그 글 "구조" 분석 결과 렌더링 컴포넌트.
//
// 입력 shape (structure-analyzer 결과):
//   {
//     title, intro{text,charCount,paragraphCount},
//     sections: [{index, heading, marker, charCount, paragraphCount, imageCount}],
//     outro: null | {...},
//     totals, score, recommendations, ideal
//   }
//
// 렌더 구성:
//   1) 카드 헤더: "구조 분석" + 총 점수
//   2) 구조 요약 바 (도입 · 섹션 × N · 마무리) — 길이 비례 bar
//   3) 이상 구조 대비 체크리스트 (제목/도입/섹션/이미지/마무리)
//   4) 섹션 목차 (순서대로, 각 섹션 글자수/이미지 + 상태 태그)
//
// 스타일: panel.css 의 카드/리스트 클래스 재사용.

import { createEl, safeText } from '../../lib/dom-safe.js'
import { icon } from './icons.js'

/**
 * @param {object} structure - analyzeStructure 결과
 * @returns {HTMLElement}
 */
export function createStructureCard(structure) {
  const safe = normalize(structure)

  const head = createHeader(safe)
  const bar = createStructureBar(safe)
  const checklist = createChecklist(safe)
  const toc = createTableOfContents(safe)

  return createEl(
    'section',
    { className: 'bm-structure-card bm-card', 'data-component': 'structure' },
    [head, bar, checklist, toc],
  )
}

// ─────────────────────────────────────────────────────────────
// 정규화
// ─────────────────────────────────────────────────────────────

function normalize(s) {
  return {
    title: String(s?.title ?? ''),
    intro: s?.intro ?? { text: '', charCount: 0, paragraphCount: 0 },
    sections: Array.isArray(s?.sections) ? s.sections : [],
    outro: s?.outro ?? null,
    totals: s?.totals ?? { sectionCount: 0, imageCount: 0, paragraphCount: 0, charCount: 0 },
    score: s?.score ?? { total: 0, titleQuality: 0, introQuality: 0, sectionCountQuality: 0, sectionBalance: 0, imageDistribution: 0, outroQuality: 0 },
    recommendations: Array.isArray(s?.recommendations) ? s.recommendations : [],
    ideal: s?.ideal ?? null,
  }
}

// ─────────────────────────────────────────────────────────────
// 헤더 — 제목 + 총점
// ─────────────────────────────────────────────────────────────

function createHeader(safe) {
  const title = createEl('h3', { className: 'bm-card__title' }, ['구조 분석'])
  const caption = createEl('span', { className: 'bm-card__caption' }, [
    `${safe.totals.sectionCount}개 섹션 · ${safe.totals.paragraphCount}단락 · ${safe.totals.imageCount}이미지`,
  ])
  const scoreWrap = createEl(
    'div',
    { className: `bm-structure-card__score ${scoreClass(safe.score.total)}` },
    [
      createEl('strong', { className: 'bm-structure-card__score-value' }, [String(safe.score.total)]),
      createEl('span', { className: 'bm-structure-card__score-sub' }, ['/100']),
    ],
  )

  return createEl('header', { className: 'bm-structure-card__head' }, [
    createEl('div', { className: 'bm-structure-card__head-left' }, [title, caption]),
    scoreWrap,
  ])
}

// ─────────────────────────────────────────────────────────────
// 구조 시각화 바 — 도입 + 섹션들 + 마무리
// ─────────────────────────────────────────────────────────────

function createStructureBar(safe) {
  const segments = []
  const totalChars = Math.max(
    1,
    (safe.intro?.charCount || 0) +
      safe.sections.reduce((acc, s) => acc + (s.charCount || 0), 0) +
      (safe.outro?.charCount || 0),
  )

  if (safe.intro?.charCount > 0) {
    segments.push(segment('intro', '도입', safe.intro.charCount, totalChars))
  }
  safe.sections.forEach((s, i) => {
    segments.push(segment(`sec-${i}`, `${i + 1}`, s.charCount || 0, totalChars, s.heading))
  })
  if (safe.outro?.charCount > 0) {
    segments.push(segment('outro', '마무리', safe.outro.charCount, totalChars))
  }

  if (segments.length === 0) {
    return createEl('div', { className: 'bm-structure-bar bm-structure-bar--empty' }, [
      createEl('span', { className: 'bm-structure-bar__empty' }, ['구조를 감지할 수 없습니다.']),
    ])
  }

  return createEl('div', { className: 'bm-structure-bar', role: 'img', 'aria-label': '구조 비율' }, segments)
}

function segment(id, label, chars, total, title) {
  const pct = (chars / total) * 100
  return createEl(
    'div',
    {
      className: `bm-structure-bar__seg bm-structure-bar__seg--${id.startsWith('sec-') ? 'section' : id}`,
      style: `flex: ${Math.max(pct, 3)};`,
      title: title ? `${title} · ${chars}자` : `${label} · ${chars}자`,
    },
    [createEl('span', { className: 'bm-structure-bar__label' }, [label])],
  )
}

// ─────────────────────────────────────────────────────────────
// 체크리스트 — 이상 구조 대비
// ─────────────────────────────────────────────────────────────

function createChecklist(safe) {
  const items = [
    checkItem({
      label: '제목',
      detail: `${safe.title.length}자`,
      ok: safe.score.titleQuality >= 70,
      hint: hintTitle(safe),
    }),
    checkItem({
      label: '도입부',
      detail: `${safe.intro.charCount}자 · ${safe.intro.paragraphCount}단락`,
      ok: safe.score.introQuality >= 70,
      hint: hintIntro(safe),
    }),
    checkItem({
      label: '섹션 구분',
      detail: `${safe.totals.sectionCount}개`,
      ok: safe.score.sectionCountQuality >= 70,
      hint: hintSectionCount(safe),
    }),
    checkItem({
      label: '섹션 균형',
      detail: `평균 ${averageSection(safe)}자`,
      ok: safe.score.sectionBalance >= 70,
      hint: hintBalance(safe),
    }),
    checkItem({
      label: '이미지 배치',
      detail: `${safe.totals.imageCount}장${safe.totals.sectionCount ? ` / ${safe.totals.sectionCount}섹션` : ''}`,
      ok: safe.score.imageDistribution >= 70,
      hint: hintImages(safe),
    }),
    checkItem({
      label: '마무리',
      detail: safe.outro ? `${safe.outro.charCount}자` : '없음',
      ok: !safe.outro || safe.score.outroQuality >= 60,
      hint: hintOutro(safe),
    }),
  ]

  return createEl('ul', { className: 'bm-structure-checklist' }, items)
}

function checkItem({ label, detail, ok, hint }) {
  // 체크/경고 마커는 icons.js 의 SVG(check/warning) — 색상은 .is-ok / .is-warn 변형 클래스가 제어.
  const mark = createEl(
    'span',
    { className: `bm-structure-checklist__icon ${ok ? 'is-ok' : 'is-warn'}`, 'aria-hidden': 'true' },
    [icon(ok ? 'check' : 'warning', { size: 14, className: 'bm-icon' })],
  )
  const left = createEl('div', { className: 'bm-structure-checklist__left' }, [
    mark,
    createEl('span', { className: 'bm-structure-checklist__label' }, [label]),
  ])
  const right = createEl('span', { className: 'bm-structure-checklist__detail' }, [detail])
  const hintEl = hint
    ? createEl('p', { className: 'bm-structure-checklist__hint' }, [hint])
    : null

  return createEl(
    'li',
    { className: `bm-structure-checklist__item ${ok ? '' : 'is-warn'}` },
    [
      createEl('div', { className: 'bm-structure-checklist__row' }, [left, right]),
      hintEl,
    ].filter(Boolean),
  )
}

// ─────────────────────────────────────────────────────────────
// 목차
// ─────────────────────────────────────────────────────────────

function createTableOfContents(safe) {
  if (!safe.sections || safe.sections.length === 0) {
    return createEl('div', { className: 'bm-structure-toc bm-structure-toc--empty' }, [
      createEl('p', { className: 'bm-structure-toc__empty' }, [
        '섹션 구분이 감지되지 않았습니다. ▶ 또는 「1.」 형태로 소제목을 만드세요.',
      ]),
    ])
  }

  const items = safe.sections.map((s) => {
    const marker = createEl('span', { className: 'bm-structure-toc__marker' }, [
      s.marker || `${s.index}.`,
    ])
    const heading = createEl('span', { className: 'bm-structure-toc__heading' }, [
      trim(s.heading || '(제목 없음)', 48),
    ])
    // 이미지 카운트는 icon('image') + 숫자 조합으로 렌더 (이모지 미사용).
    const metaChildren = [`${s.charCount}자`]
    if (s.imageCount) {
      metaChildren.push(
        ' · ',
        icon('image', { size: 12, className: 'bm-icon bm-icon--inline' }),
        ` ${s.imageCount}`,
      )
    }
    const meta = createEl('span', { className: 'bm-structure-toc__meta' }, metaChildren)
    const statusCls = sectionStatus(s)
    return createEl(
      'li',
      { className: `bm-structure-toc__item is-${statusCls}` },
      [marker, heading, meta],
    )
  })

  return createEl('div', { className: 'bm-structure-toc' }, [
    createEl('h4', { className: 'bm-structure-toc__title' }, ['목차']),
    createEl('ol', { className: 'bm-structure-toc__list' }, items),
  ])
}

function sectionStatus(s) {
  if (s.charCount < 80) return 'poor'
  if (s.charCount < 150) return 'warn'
  if (s.charCount > 800) return 'warn'
  return 'good'
}

// ─────────────────────────────────────────────────────────────
// 힌트 생성
// ─────────────────────────────────────────────────────────────

function hintTitle(safe) {
  const L = safe.title.length
  if (L === 0) return '제목이 비어 있습니다.'
  if (L < 25) return `25자 이상 권장 (현재 ${L}자).`
  if (L > 80) return `검색노출은 60자까지 권장 (현재 ${L}자).`
  return null
}

function hintIntro(safe) {
  const c = safe.intro.charCount
  if (c < 150) return '150자 이상으로 글의 동기/배경을 제시하세요.'
  if (c > 700) return '도입부가 길면 독자 이탈 위험. 500자 이내로 압축하세요.'
  return null
}

function hintSectionCount(safe) {
  const n = safe.totals.sectionCount
  if (n === 0) return '▶, ■, 또는 「1.」 형태로 소제목을 추가하세요.'
  if (n < 3) return '3개 이상의 섹션으로 나누면 가독성이 좋아집니다.'
  if (n > 9) return '섹션이 너무 많습니다. 비슷한 주제를 묶으세요.'
  return null
}

function hintBalance(safe) {
  if (safe.sections.length === 0) return null
  const shortCount = safe.sections.filter((s) => s.charCount < 80).length
  if (shortCount > 0) return `${shortCount}개 섹션의 본문이 너무 짧습니다 (80자 미만).`
  return null
}

function hintImages(safe) {
  const imgs = safe.totals.imageCount
  const secs = safe.totals.sectionCount
  if (imgs === 0 && secs > 0) return '이미지가 없습니다. 각 섹션당 1장 이상 넣어보세요.'
  if (secs > 0 && imgs < secs) return `섹션이 ${secs}개인데 이미지는 ${imgs}장. 섹션별 1장 이상 권장.`
  return null
}

function hintOutro(safe) {
  if (!safe.outro && safe.sections.length >= 3) {
    return '마무리 문단이 없습니다. 요약이나 행동 유도로 끝내보세요.'
  }
  return null
}

// ─────────────────────────────────────────────────────────────
// 유틸
// ─────────────────────────────────────────────────────────────

function scoreClass(n) {
  if (n >= 80) return 'is-good'
  if (n >= 60) return 'is-warn'
  return 'is-poor'
}

function averageSection(safe) {
  if (!safe.sections.length) return 0
  const sum = safe.sections.reduce((a, s) => a + (s.charCount || 0), 0)
  return Math.round(sum / safe.sections.length)
}

function trim(s, n) {
  if (!s) return ''
  return s.length > n ? s.slice(0, n) + '…' : s
}
