// extension/lib/analyzers/structure-analyzer.js
// 한국 블로그 글의 구조를 분석한다.
//
// 분석 대상:
//   - 제목 (title)
//   - 도입부 (첫 섹션 헤더 전까지의 문단)
//   - 섹션 (헤더 마커로 구분된 본문 블록)
//   - 마무리 (마지막 섹션 이후 남는 문단)
//
// 섹션 헤더 판정 기준 (강한 신호만):
//   1) 마커 시작: ▶ ▷ ■ □ ◆ ◇ ● ○ ▪ ▫ ※ ★ ✅
//   2) 숫자 + 제목: "1. 제목" "1) 제목" (숫자 뒤 반드시 본문 텍스트)
//   3) STEP: "STEP 1 제목"
//   4) 마크다운 H: "## 제목" "### 제목"
// ⚠️ "짧은 단독 줄" 휴리스틱은 제거 — SmartEditor 의 짤막한 연속 단락을
//    섹션 헤더로 오인식하는 문제가 있었음.
//
// 이상 구조(한국 SEO 기준):
//   - 제목: 25~60자
//   - 도입: 150~500자, 2~4문단
//   - 섹션: 3~6개
//   - 각 섹션: 150~600자, 이미지 권장
//   - 마무리: 100~400자 (선택)

// ─────────────────────────────────────────────────────────────
// 상수
// ─────────────────────────────────────────────────────────────

const MARKER_CHARS = '▶▷■□◆◇●○▪▫※★✅🟥🟧🟦'
const MARKER_RE = new RegExp(`^\\s*[${MARKER_CHARS}]\\s*(.{2,80}?)\\s*$`)
const NUMBERED_RE = /^\s*(\d{1,2})[.)]\s+(.{2,80}?)\s*$/
const STEP_RE = /^\s*(STEP|Step|step)\s*(\d{1,2})[.:\s]+(.{2,80}?)\s*$/
const HASH_RE = /^\s*(#{2,4})\s+(.{2,80}?)\s*$/

// Sanity 임계값.
// - NUMBERED_LIST_THRESHOLD: 숫자 헤더가 이 개수 이상이면 "리스트" 로 보고 헤더 아님으로 강등
// - MIN_SECTION_BODY_CHARS : 헤더 다음 본문이 이 미만이면 실질 섹션 아님 — 헤더 무시
// - MAX_REAL_SECTIONS      : 필터링 후 섹션 수가 이 초과면 리스트 오탐으로 간주 — sections 비움
const NUMBERED_LIST_THRESHOLD = 7
const MIN_SECTION_BODY_CHARS = 30
const MAX_REAL_SECTIONS = 20

const IDEAL = Object.freeze({
  TITLE_MIN: 25,
  TITLE_MAX: 60,
  INTRO_MIN_CHARS: 150,
  INTRO_MAX_CHARS: 500,
  SECTION_COUNT_MIN: 3,
  SECTION_COUNT_MAX: 6,
  SECTION_MIN_CHARS: 150,
  SECTION_MAX_CHARS: 600,
  OUTRO_MIN_CHARS: 100,
  OUTRO_MAX_CHARS: 400,
  IMG_PER_SECTION_MIN: 1, // 권장
})

// ─────────────────────────────────────────────────────────────
// 공개 API
// ─────────────────────────────────────────────────────────────

/**
 * 블로그 글 구조를 분석한다.
 * @param {Object} input
 * @param {string} input.title
 * @param {string} input.content       - 본문 plain text (개행 포함)
 * @param {Array}  [input.images]      - [{src, alt}, ...]
 * @returns {StructureResult}
 */
export function analyzeStructure({ title = '', content = '', images = [] } = {}) {
  const safeTitle = String(title || '').trim()
  const safeContent = String(content || '')
  const imageCount = Array.isArray(images) ? images.length : 0

  const lines = splitLines(safeContent)
  const headerIndices = detectHeaders(lines)
  const { intro, sections, outro, falsePositive } = groupBySections(lines, headerIndices)

  // 각 섹션에 이미지 근사 분배 (총 이미지 / 섹션 수, 소수점 버림 + 우선순위)
  distributeImages(sections, imageCount)

  const score = computeScore({
    title: safeTitle,
    intro,
    sections,
    outro,
    imageCount,
  })

  const recommendations = buildRecommendations({
    title: safeTitle,
    intro,
    sections,
    outro,
    imageCount,
    score,
    falsePositive,
  })

  return {
    title: safeTitle,
    intro,
    sections,
    outro,
    falsePositive: !!falsePositive,
    totals: {
      sectionCount: sections.length,
      imageCount,
      paragraphCount: lines.length,
      charCount: safeContent.length,
    },
    score,
    recommendations,
    ideal: IDEAL,
  }
}

// ─────────────────────────────────────────────────────────────
// 줄 분리
// ─────────────────────────────────────────────────────────────

function splitLines(content) {
  return String(content)
    .split(/\n+/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
}

// ─────────────────────────────────────────────────────────────
// 헤더 감지
// ─────────────────────────────────────────────────────────────

/**
 * @param {string[]} lines
 * @returns {Array<{ index: number, heading: string, type: string, marker?: string }>}
 */
function detectHeaders(lines) {
  const headers = []
  lines.forEach((line, i) => {
    if (line.length > 120) return // 너무 긴 줄은 헤더 아님

    // 1) 마커 시작 (▶ ■ 등) — 헤딩 텍스트 최소 2자
    const m1 = line.match(MARKER_RE)
    if (m1 && m1[1].trim().length >= 2) {
      headers.push({
        index: i,
        heading: m1[1].trim(),
        type: 'marker',
        marker: line.trim().charAt(0),
      })
      return
    }

    // 2) 숫자 + 제목 (헤딩 텍스트 최소 2자, 전체 80자 이하)
    const m2 = line.match(NUMBERED_RE)
    if (m2 && m2[2].trim().length >= 2 && line.length <= 80) {
      headers.push({
        index: i,
        heading: m2[2].trim(),
        type: 'numbered',
        marker: `${m2[1]}.`,
      })
      return
    }

    // 3) STEP
    const m3 = line.match(STEP_RE)
    if (m3 && m3[3].trim().length >= 2) {
      headers.push({
        index: i,
        heading: m3[3].trim(),
        type: 'step',
        marker: `STEP ${m3[2]}`,
      })
      return
    }

    // 4) Markdown H
    const m4 = line.match(HASH_RE)
    if (m4 && m4[2].trim().length >= 2) {
      headers.push({
        index: i,
        heading: m4[2].trim(),
        type: 'hash',
        marker: m4[1],
      })
      return
    }
    // 약한 신호(짧은 줄 = 헤더) 휴리스틱 삭제. 헤더 없음으로 판정.
  })

  // Sanity: "1. ... 2. ... 3. ..." 식 숫자 목록은 섹션 헤더가 아니라 리스트.
  // NUMBERED_RE 가 일반 숫자 목록도 잡으므로, 숫자 헤더가 과하게 많으면 전부 강등.
  // (섹션 헤더가 7개 이상인 정상 글은 매우 드물다 — IDEAL.SECTION_COUNT_MAX=6)
  const numberedCount = headers.filter((h) => h.type === 'numbered').length
  if (numberedCount >= NUMBERED_LIST_THRESHOLD) {
    return headers.filter((h) => h.type !== 'numbered')
  }
  return headers
}

// ─────────────────────────────────────────────────────────────
// 섹션 그룹핑
// ─────────────────────────────────────────────────────────────

/**
 * @param {string[]} lines
 * @param {ReturnType<typeof detectHeaders>} headers
 */
function groupBySections(lines, headers) {
  // 약한 신호(short) 만 있는 경우는 헤더로 쳐주지 않는 편이 안전 (시 인용 등 오인식).
  // 하지만 강한 신호(marker/numbered/step/hash)가 하나라도 있으면 그것만 사용.
  const strong = headers.filter((h) => h.type !== 'short')
  let used = strong.length > 0 ? strong : headers

  // Sanity 1: 헤더 사이 본문이 MIN_SECTION_BODY_CHARS 미만이면 실질 섹션이 아니다 →
  //           해당 헤더 무시. (예: 한 줄짜리 인용 뒤에 바로 다음 헤더)
  const filteredByBody = []
  for (let i = 0; i < used.length; i++) {
    const cur = used[i]
    const next = used[i + 1]
    const endIdx = next ? next.index : lines.length
    const bodyLines = lines.slice(cur.index + 1, endIdx)
    const bodyChars = bodyLines.join('').length
    if (bodyChars >= MIN_SECTION_BODY_CHARS) filteredByBody.push(cur)
  }
  used = filteredByBody

  if (used.length === 0) {
    // 섹션 없음 → 전체가 intro
    return {
      intro: buildBlock('intro', '도입부', lines),
      sections: [],
      outro: null,
      falsePositive: false,
    }
  }

  // 첫 헤더 이전 = intro
  const firstIdx = used[0].index
  const introLines = lines.slice(0, firstIdx)
  const intro = buildBlock('intro', '도입부', introLines)

  // 섹션 분리
  const sections = []
  for (let i = 0; i < used.length; i++) {
    const cur = used[i]
    const next = used[i + 1]
    const endIdx = next ? next.index : lines.length

    // 본문은 헤더 다음 줄부터 다음 헤더 전까지
    const bodyLines = lines.slice(cur.index + 1, endIdx)
    sections.push({
      index: i + 1,
      heading: cur.heading,
      headingType: cur.type,
      marker: cur.marker || null,
      bodyLines,
      bodyText: bodyLines.join('\n'),
      charCount: bodyLines.join('').length,
      paragraphCount: bodyLines.length,
      imageCount: 0, // distributeImages 에서 분배
    })
  }

  // Sanity 2: body 필터 후에도 섹션이 20개 초과면 숫자 리스트 오탐으로 판정.
  //           → sections 를 비우고 recommendations 에 불명확성 안내 (호출부에서 처리).
  if (sections.length > MAX_REAL_SECTIONS) {
    return {
      intro: buildBlock('intro', '도입부', lines),
      sections: [],
      outro: null,
      falsePositive: true,
    }
  }

  // 마지막 섹션이 너무 짧고(예: 40자 이하) 전체의 끝에 위치하면 outro 로 승격
  let outro = null
  const last = sections[sections.length - 1]
  if (last && last.charCount < 80 && sections.length >= 2) {
    outro = {
      heading: last.heading,
      text: last.bodyText,
      charCount: last.charCount,
      paragraphCount: last.paragraphCount,
    }
    sections.pop()
  }

  return { intro, sections, outro, falsePositive: false }
}

function buildBlock(key, label, lines) {
  const text = lines.join('\n')
  return {
    key,
    label,
    text,
    charCount: text.length,
    paragraphCount: lines.length,
  }
}

// ─────────────────────────────────────────────────────────────
// 이미지 분배 (근사)
// ─────────────────────────────────────────────────────────────

function distributeImages(sections, imageCount) {
  if (sections.length === 0 || imageCount === 0) return
  const perSection = Math.floor(imageCount / sections.length)
  const remainder = imageCount % sections.length
  sections.forEach((s, i) => {
    s.imageCount = perSection + (i < remainder ? 1 : 0)
  })
}

// ─────────────────────────────────────────────────────────────
// 점수 계산
// ─────────────────────────────────────────────────────────────

/**
 * 각 측면 0~100점, 총점은 가중 평균.
 */
function computeScore({ title, intro, sections, outro, imageCount }) {
  const titleQuality = scoreTitleLength(title.length)
  const introQuality = scoreRange(intro.charCount, IDEAL.INTRO_MIN_CHARS, IDEAL.INTRO_MAX_CHARS)
  const sectionCountQuality = scoreSectionCount(sections.length)
  const sectionBalance = scoreSectionBalance(sections)
  const imageDistribution = scoreImageDistribution(sections, imageCount)
  const outroQuality = outro
    ? scoreRange(outro.charCount, IDEAL.OUTRO_MIN_CHARS, IDEAL.OUTRO_MAX_CHARS)
    : 60 // 마무리 없어도 감점은 약함

  // 가중 평균
  const total = Math.round(
    titleQuality * 0.15 +
    introQuality * 0.15 +
    sectionCountQuality * 0.20 +
    sectionBalance * 0.20 +
    imageDistribution * 0.20 +
    outroQuality * 0.10
  )

  return {
    total: clamp(total, 0, 100),
    titleQuality: Math.round(titleQuality),
    introQuality: Math.round(introQuality),
    sectionCountQuality: Math.round(sectionCountQuality),
    sectionBalance: Math.round(sectionBalance),
    imageDistribution: Math.round(imageDistribution),
    outroQuality: Math.round(outroQuality),
  }
}

function scoreTitleLength(len) {
  if (len === 0) return 0
  if (len < IDEAL.TITLE_MIN) return lerp(50, 85, len / IDEAL.TITLE_MIN)
  if (len <= IDEAL.TITLE_MAX) return 100
  if (len <= IDEAL.TITLE_MAX + 20) return lerp(100, 70, (len - IDEAL.TITLE_MAX) / 20)
  return 50
}

function scoreRange(value, min, max) {
  if (value === 0) return 0
  if (value < min) return lerp(30, 90, value / min)
  if (value <= max) return 100
  const over = (value - max) / max
  return clamp(lerp(100, 50, over), 40, 100)
}

function scoreSectionCount(n) {
  if (n === 0) return 20
  if (n < IDEAL.SECTION_COUNT_MIN) return lerp(50, 80, n / IDEAL.SECTION_COUNT_MIN)
  if (n <= IDEAL.SECTION_COUNT_MAX) return 100
  if (n <= IDEAL.SECTION_COUNT_MAX + 3) return lerp(100, 75, (n - IDEAL.SECTION_COUNT_MAX) / 3)
  return 65
}

function scoreSectionBalance(sections) {
  if (sections.length === 0) return 0
  // 각 섹션을 IDEAL 범위 기준으로 점수화 → 평균
  const perScores = sections.map((s) =>
    scoreRange(s.charCount, IDEAL.SECTION_MIN_CHARS, IDEAL.SECTION_MAX_CHARS)
  )
  const mean = perScores.reduce((a, b) => a + b, 0) / perScores.length
  return mean
}

function scoreImageDistribution(sections, imageCount) {
  if (sections.length === 0) {
    return imageCount > 0 ? 70 : 50
  }
  const expected = sections.length * IDEAL.IMG_PER_SECTION_MIN
  if (imageCount >= expected) return 100
  if (imageCount === 0) return 30
  return lerp(50, 100, imageCount / expected)
}

// ─────────────────────────────────────────────────────────────
// 추천사항
// ─────────────────────────────────────────────────────────────

function buildRecommendations({ title, intro, sections, outro, imageCount, score, falsePositive }) {
  const recs = []

  // Sanity: 숫자 리스트 등의 오탐으로 섹션 탐지를 포기한 경우 최상단에 안내.
  if (falsePositive) {
    recs.push(rec(
      'medium',
      'section',
      '목록이 많아 섹션 구분이 불명확합니다. 숫자 목록 대신 ▶ 또는 ## 마커로 섹션을 구분하세요.',
    ))
  }

  // 제목
  if (title.length === 0) {
    recs.push(rec('high', 'title', '제목이 비어 있습니다. 25~60자의 명확한 제목을 작성하세요.'))
  } else if (title.length < IDEAL.TITLE_MIN) {
    recs.push(rec('medium', 'title', `제목이 너무 짧습니다 (${title.length}자). 검색 노출을 위해 25자 이상 권장합니다.`))
  } else if (title.length > IDEAL.TITLE_MAX + 20) {
    recs.push(rec('medium', 'title', `제목이 깁니다 (${title.length}자). 검색 결과에서 60자까지만 표시됩니다.`))
  }

  // 도입부
  if (intro.charCount < IDEAL.INTRO_MIN_CHARS) {
    recs.push(rec('high', 'intro', `도입부가 부족합니다 (${intro.charCount}자). 150자 이상으로 글의 배경/동기를 써주세요.`))
  } else if (intro.charCount > IDEAL.INTRO_MAX_CHARS + 200) {
    recs.push(rec('low', 'intro', `도입부가 깁니다 (${intro.charCount}자). 독자가 본문까지 도달하도록 500자 이내로 압축하세요.`))
  }

  // 섹션 수
  if (sections.length === 0) {
    recs.push(rec('high', 'section', '섹션 구분이 없습니다. ▶ 또는 번호 매김으로 3~6개 섹션을 만드세요.'))
  } else if (sections.length < IDEAL.SECTION_COUNT_MIN) {
    recs.push(rec('medium', 'section', `섹션이 ${sections.length}개뿐입니다. 3~6개로 나누면 가독성이 좋아집니다.`))
  } else if (sections.length > IDEAL.SECTION_COUNT_MAX + 3) {
    recs.push(rec('low', 'section', `섹션이 많습니다 (${sections.length}개). 비슷한 내용을 묶어 6개 이내로 조정하세요.`))
  }

  // 섹션별 분량 문제
  sections.forEach((s) => {
    if (s.charCount < 80) {
      recs.push(rec('medium', 'section-body',
        `「${trim(s.heading, 24)}」 본문이 너무 짧습니다 (${s.charCount}자). 150자 이상 권장.`))
    } else if (s.charCount > IDEAL.SECTION_MAX_CHARS + 200) {
      recs.push(rec('low', 'section-body',
        `「${trim(s.heading, 24)}」 본문이 너무 깁니다 (${s.charCount}자). 소제목을 더 나누는 것을 고려하세요.`))
    }
  })

  // 이미지
  if (sections.length > 0 && imageCount === 0) {
    recs.push(rec('high', 'image', '이미지가 없습니다. 각 섹션마다 1개 이상의 관련 이미지를 넣으세요.'))
  } else if (sections.length > 0 && imageCount < sections.length) {
    recs.push(rec('medium', 'image',
      `이미지가 ${imageCount}개입니다. 섹션이 ${sections.length}개이므로 각 섹션당 1개 이상 권장합니다.`))
  }

  // 마무리
  if (sections.length >= 3 && !outro) {
    recs.push(rec('low', 'outro', '마무리 문단이 없습니다. 핵심 요약이나 독자 행동 유도로 마무리하세요.'))
  }

  return recs
}

function rec(priority, category, text) {
  return { priority, category, text }
}

// ─────────────────────────────────────────────────────────────
// 유틸
// ─────────────────────────────────────────────────────────────

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v))
}
function lerp(a, b, t) {
  return a + (b - a) * clamp(t, 0, 1)
}
function trim(s, n) {
  if (!s) return ''
  return s.length > n ? s.slice(0, n) + '…' : s
}

/**
 * @typedef {Object} StructureResult
 * @property {string} title
 * @property {{key:string,label:string,text:string,charCount:number,paragraphCount:number}} intro
 * @property {Array<{index:number,heading:string,headingType:string,marker:string|null,bodyText:string,charCount:number,paragraphCount:number,imageCount:number}>} sections
 * @property {{heading:string,text:string,charCount:number,paragraphCount:number}|null} outro
 * @property {{sectionCount:number,imageCount:number,paragraphCount:number,charCount:number}} totals
 * @property {{total:number,titleQuality:number,introQuality:number,sectionCountQuality:number,sectionBalance:number,imageDistribution:number,outroQuality:number}} score
 * @property {Array<{priority:'high'|'medium'|'low',category:string,text:string}>} recommendations
 * @property {typeof IDEAL} ideal
 */
