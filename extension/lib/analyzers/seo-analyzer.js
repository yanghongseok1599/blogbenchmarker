// extension/lib/analyzers/seo-analyzer.js
// 메인 SEO 분석 엔진
// 입력:  { title, content, meta, images }
// 출력:  { totalScore, sections, recommendations, stats, hookDetection, warnings }
// 원칙: 결정적·순수 함수. DOM / chrome / fetch 의존 금지.
// 참조: .claude/skills/seo-analyzer-rules §1 (점수 체계), §5 (경계 케이스), §6 (ReDoS)
//
// 점수 배분 (합계 100):
//   titleSeo        20  — 길이 / 키워드 / 숫자·브래킷 / 감점
//   contentSeo      30  — 문단 / 이미지 / FIRE(IRE) / 신뢰성
//   hookScore       15  — 첫 문단 후킹 타입 + confidence
//   readability     20  — 평균 문장 길이 / 문장 유형 분포 / 이모지 밀도
//   keywordDensity  15  — 상위 키워드 밀도 + 제목-본문 일치
//   ------------------------------------------------------------
//   합계           100

import {
  splitSentences,
  topKeywords,
  avgSentenceLength,
  sentenceDistribution,
  countCharacters,
  countParagraphs,
  countEmojis,
  hasNumericPattern,
  normalizeText
} from './nlp-utils.js'
import { detectHook, HOOK_TYPES } from './hook-detector.js'

// -----------------------------------------------------------------------------
// 섹션 만점 (UI 가 참조)
// -----------------------------------------------------------------------------

export const SECTION_MAX = Object.freeze({
  titleSeo:       20,
  contentSeo:     30,
  hookScore:      15,
  readability:    20,
  keywordDensity: 15
})

// -----------------------------------------------------------------------------
// 정규식 (ReDoS 안전 — 전부 alternation / 문자 클래스 / 상한 반복)
// -----------------------------------------------------------------------------

const TITLE_HAS_NUMBER    = /\d{1,4}/
const TITLE_HAS_BRACKET   = /[\[\]【】\(\)]/
const TITLE_BAD_SYMBOLS   = /[!?]{2,3}/
const CONTENT_EXAMPLE_CUE = /(예를\s?들어|가령|실제로|예컨대|실제\s?사례)/
const CONTENT_QUOTE_CUE   = /(~에\s?따르면|출처|참고|링크)/
const CONTENT_FIRST_PERSON = /(저는|제가|제\s?경험|해봤|써봤|사용해\s?봤)/
const CONTENT_URL_RE      = /https?:\/\/[^\s)]{1,200}/
const HEADING_MARKER      = /(^#{1,3}\s|^▪|^■|^▶|^▷|^·)/m

// -----------------------------------------------------------------------------
// 메인 진입점
// -----------------------------------------------------------------------------

/**
 * 블로그 글을 분석해 SEO 점수와 추천사항을 반환.
 * @param {Object} input
 * @param {string} input.title
 * @param {string} input.content
 * @param {Object} [input.meta]   - { keyword?, tags?, ... }
 * @param {Array}  [input.images] - [{ src, alt }, ...]
 */
export function analyze({ title = '', content = '', meta = {}, images = [] } = {}) {
  const titleStr = normalizeText(title)
  const contentStr = String(content || '')
  const imgs = Array.isArray(images) ? images : []

  // 경계 케이스: 완전 빈 입력
  if (!titleStr && !contentStr.trim()) {
    return buildEmptyResult()
  }

  const stats = computeStats(contentStr, imgs)
  const firstParagraph = extractFirstParagraph(contentStr)
  const hookDetection = detectHook(firstParagraph)

  const titleSeo       = scoreTitle(titleStr, meta)
  const hookScore      = scoreHook(hookDetection, firstParagraph)
  const contentSeo     = scoreContent(contentStr, imgs, stats)
  const readability    = scoreReadability(contentStr, stats)
  const keywordDensity = scoreKeywordDensity(titleStr, contentStr, stats)

  const totalScore =
    titleSeo.score + contentSeo.score + hookScore.score +
    readability.score + keywordDensity.score

  const sections = { titleSeo, contentSeo, hookScore, readability, keywordDensity }
  const recommendations = buildRecommendations({
    sections, stats, hookDetection, images: imgs, title: titleStr
  })
  const warnings = buildWarnings(stats, imgs)

  return {
    totalScore: clamp(totalScore, 0, 100),
    sections,
    recommendations,
    stats,
    hookDetection,
    warnings
  }
}

// -----------------------------------------------------------------------------
// 통계 / 첫 문단 추출
// -----------------------------------------------------------------------------

function computeStats(content, images) {
  const sentences = splitSentences(content)
  return {
    charCount:         countCharacters(content),
    paragraphCount:    countParagraphs(content),
    sentenceCount:     sentences.length,
    imageCount:        images.length,
    wordCount:         String(content).split(/\s+/).filter(Boolean).length,
    avgSentenceLength: avgSentenceLength(content),
    emojiCount:        countEmojis(content)
  }
}

function extractFirstParagraph(content) {
  const parts = String(content)
    .split(/\n{2,}/)
    .map(s => s.trim())
    .filter(Boolean)
  return parts[0] ?? String(content).slice(0, 500)
}

// -----------------------------------------------------------------------------
// 섹션별 점수 계산
// -----------------------------------------------------------------------------

function scoreTitle(title, meta) {
  const details = {
    text: title,
    length: 0,
    keyword: 0,
    hasNumberOrBracket: 0,
    penalty: 0
  }
  if (!title) {
    return { score: 0, maxScore: SECTION_MAX.titleSeo, details }
  }

  const len = title.length
  // 길이 점수 (최대 8점) — 20~40자 이상적
  if (len >= 20 && len <= 40)      details.length = 8
  else if (len >= 15 && len < 20)  details.length = 6
  else if (len > 40 && len <= 50)  details.length = 5
  else if (len >= 10)              details.length = 3
  else                             details.length = 1

  // 키워드 포함 (최대 6점) — meta.keyword 제공 시 엄격 검사
  const kw = meta?.keyword ?? meta?.primaryKeyword
  if (kw && typeof kw === 'string' && title.includes(kw)) {
    details.keyword = 6
  } else if (kw) {
    details.keyword = 0
  } else {
    details.keyword = 3 // 키워드 미지정 시 중립 점수
  }

  // 숫자 / 브래킷 가산 (최대 4점)
  if (TITLE_HAS_NUMBER.test(title))  details.hasNumberOrBracket += 2
  if (TITLE_HAS_BRACKET.test(title)) details.hasNumberOrBracket += 2
  details.hasNumberOrBracket = Math.min(details.hasNumberOrBracket, 4)

  // 감점 — 물음표/느낌표 남발
  if (TITLE_BAD_SYMBOLS.test(title)) details.penalty = -2

  const raw = details.length + details.keyword + details.hasNumberOrBracket + details.penalty
  return {
    score: clamp(raw, 0, SECTION_MAX.titleSeo),
    maxScore: SECTION_MAX.titleSeo,
    details
  }
}

function scoreHook(hookDetection, firstParagraph) {
  const details = {
    type:          hookDetection.type,
    confidence:    hookDetection.confidence,
    firstSentence: hookDetection.firstSentence,
    matchedPattern: hookDetection.matchedPattern
  }
  let score
  if (hookDetection.type === HOOK_TYPES.UNKNOWN) {
    // 어떤 패턴도 감지되지 않음 — 길이만으로 약한 보너스
    score = firstParagraph.length > 50 ? 3 : 0
  } else if (hookDetection.confidence >= 0.8) {
    score = 15
  } else if (hookDetection.confidence >= 0.5) {
    score = 10
  } else {
    score = 5
  }
  return { score, maxScore: SECTION_MAX.hookScore, details }
}

function scoreContent(content, images, stats) {
  const details = {
    paragraphs: 0,
    images:     0,
    fire:       0, // I + R + E (F 는 hookScore 에서 별도)
    trust:      0,
    hasHeading: HEADING_MARKER.test(content)
  }

  // 문단 구조 (최대 8점) — 3~15 적정
  if (stats.paragraphCount >= 3 && stats.paragraphCount <= 15) details.paragraphs = 8
  else if (stats.paragraphCount >= 2) details.paragraphs = 5
  else if (stats.paragraphCount === 1 && stats.charCount >= 300) details.paragraphs = 2
  if (details.hasHeading && details.paragraphs > 0) details.paragraphs = Math.min(details.paragraphs + 1, 8)

  // 이미지 (최대 8점) — 3~10 적정
  if (stats.imageCount >= 3 && stats.imageCount <= 10) details.images = 8
  else if (stats.imageCount >= 1)                       details.images = 5
  else                                                  details.images = 0

  // FIRE (최대 8점) — I(흥미) + R(근거) + E(예시)
  let fire = 0
  if (hasNumericPattern(content))   fire += 3 // I / R — 수치 근거
  if (CONTENT_EXAMPLE_CUE.test(content)) fire += 3 // E — 예시 표지
  if (CONTENT_QUOTE_CUE.test(content))   fire += 2 // R — 인용/출처
  details.fire = Math.min(fire, 8)

  // 신뢰성 (최대 6점) — 개인 경험 / 수치 / 출처
  let trust = 0
  if (hasNumericPattern(content))      trust += 2
  if (CONTENT_URL_RE.test(content) || CONTENT_QUOTE_CUE.test(content)) trust += 2
  if (CONTENT_FIRST_PERSON.test(content)) trust += 2
  details.trust = Math.min(trust, 6)

  const raw = details.paragraphs + details.images + details.fire + details.trust
  return {
    score: clamp(raw, 0, SECTION_MAX.contentSeo),
    maxScore: SECTION_MAX.contentSeo,
    details
  }
}

function scoreReadability(content, stats) {
  const dist = sentenceDistribution(content)
  const details = {
    avgSentenceLength: stats.avgSentenceLength,
    sentenceDistribution: dist,
    emojiCount: stats.emojiCount,
    emojiDensity: 0,
    emojiPenalty: 0
  }
  let score = 0

  // 평균 문장 길이 (최대 12점) — 30~60자 이상적
  const avg = stats.avgSentenceLength
  if (avg >= 30 && avg <= 60)       score += 12
  else if (avg >= 20 && avg < 30)   score += 9
  else if (avg > 60 && avg <= 80)   score += 7
  else if (avg > 0)                 score += 3

  // 문장 유형 분포 (최대 4점) — 질문+감탄이 10~40%
  const interactive = (dist.question ?? 0) + (dist.exclamation ?? 0)
  if (interactive >= 0.1 && interactive <= 0.4) score += 4
  else if (interactive > 0)                     score += 2

  // 이모지 (최대 4점) — 적정 사용 +4, 과도 사용 -4
  const totalChars = stats.charCount || 1
  const density = stats.emojiCount / totalChars
  details.emojiDensity = Math.round(density * 10000) / 100 // 퍼센트
  if (stats.emojiCount > 0 && density <= 0.02)       score += 4
  else if (stats.emojiCount === 0)                    score += 2
  else if (density > 0.05) {
    score -= 4
    details.emojiPenalty = -4
  }

  return {
    score: clamp(score, 0, SECTION_MAX.readability),
    maxScore: SECTION_MAX.readability,
    details
  }
}

function scoreKeywordDensity(title, content, stats) {
  const keywords = topKeywords(content, 10)
  const details = {
    topKeywords: keywords,
    titleMatchCount: 0,
    topDensityPercent: 0
  }
  if (keywords.length === 0 || stats.wordCount === 0) {
    return { score: 0, maxScore: SECTION_MAX.keywordDensity, details }
  }

  // 최상위 키워드 밀도 (최대 8점) — 1~3% 적정
  const topCount = keywords[0].count
  const density = topCount / Math.max(stats.wordCount, 1)
  details.topDensityPercent = Math.round(density * 10000) / 100
  let score = 0
  if (density >= 0.01 && density <= 0.03)        score += 8
  else if (density > 0 && density < 0.01)        score += 5
  else if (density > 0.03 && density <= 0.05)    score += 5
  else                                            score += 2

  // 제목-본문 키워드 일치 (최대 7점)
  let match = 0
  for (const { word } of keywords.slice(0, 5)) {
    if (title && title.includes(word)) match++
  }
  details.titleMatchCount = match
  score += Math.min(match * 2, 7)

  return {
    score: clamp(score, 0, SECTION_MAX.keywordDensity),
    maxScore: SECTION_MAX.keywordDensity,
    details
  }
}

// -----------------------------------------------------------------------------
// 추천 사항 / 경고
// -----------------------------------------------------------------------------

function buildRecommendations({ sections, stats, hookDetection, images, title }) {
  const rec = []
  const { titleSeo, contentSeo, hookScore, readability, keywordDensity } = sections

  // 제목
  if (titleSeo.score < titleSeo.maxScore * 0.6) {
    if (titleSeo.details.length <= 3) {
      rec.push('제목을 20~40자로 조정하세요. 너무 짧거나 깁니다.')
    }
    if (titleSeo.details.hasNumberOrBracket === 0) {
      rec.push('제목에 숫자 또는 브래킷(예: "3가지 방법", "[2026]")을 넣으면 클릭률이 올라갑니다.')
    }
    if (titleSeo.details.penalty < 0) {
      rec.push('제목의 물음표/느낌표 남발을 줄이세요. 1회로 충분합니다.')
    }
  }

  // 후킹
  if (hookScore.score < 10) {
    rec.push(
      `첫 문장 후킹이 약합니다(${hookDetection.type}). 질문·통계·스토리텔링 중 하나의 패턴을 적용해 보세요.`
    )
  }

  // 콘텐츠
  if (stats.imageCount < 3) {
    rec.push(`이미지를 3개 이상 추가하세요. (현재: ${stats.imageCount}개)`)
  }
  if (stats.charCount < 800) {
    rec.push(`글자수가 ${stats.charCount}자로 짧습니다. 800자 이상 권장.`)
  }
  if (contentSeo.details.trust < 3) {
    rec.push('개인 경험·수치·출처 등 신뢰성 요소를 추가하세요.')
  }
  if (contentSeo.details.fire < 4) {
    rec.push('수치 / 예시("예를 들어") / 인용 중 최소 2가지를 포함하세요.')
  }

  // 가독성
  if (readability.details.avgSentenceLength > 80) {
    rec.push(`문장이 너무 깁니다(평균 ${readability.details.avgSentenceLength}자). 30~60자로 쪼개세요.`)
  } else if (readability.details.avgSentenceLength < 20 && readability.details.avgSentenceLength > 0) {
    rec.push('문장이 짧습니다. 정보 밀도를 높이세요.')
  }
  if (readability.details.emojiPenalty < 0) {
    rec.push('이모지 사용이 과도합니다. 문단당 1~2개로 줄이세요.')
  }

  // 키워드
  if (
    keywordDensity.details.titleMatchCount === 0 &&
    keywordDensity.details.topKeywords.length > 0
  ) {
    const top3 = keywordDensity.details.topKeywords.slice(0, 3).map(k => k.word).join(', ')
    rec.push(`본문 주요 키워드(${top3})를 제목에 포함하세요.`)
  }

  return rec.slice(0, 8) // 최대 8개
}

function buildWarnings(stats, images) {
  const w = []
  if (stats.charCount < 100) w.push('too_short')
  if (stats.charCount > 10000) w.push('too_long')
  if (images.length > 0 && stats.charCount < 100) w.push('image_only')
  if ((stats.emojiCount / (stats.charCount || 1)) > 0.05) w.push('emoji_bomb')
  if (stats.charCount === 0 && stats.imageCount === 0) w.push('empty')
  return w
}

// -----------------------------------------------------------------------------
// Fallback: 완전 빈 입력
// -----------------------------------------------------------------------------

function buildEmptyResult() {
  const zero = (name) => ({ score: 0, maxScore: SECTION_MAX[name], details: {} })
  return {
    totalScore: 0,
    sections: {
      titleSeo:       zero('titleSeo'),
      contentSeo:     zero('contentSeo'),
      hookScore:      zero('hookScore'),
      readability:    zero('readability'),
      keywordDensity: zero('keywordDensity')
    },
    recommendations: ['글이 비어있습니다. 제목과 본문을 작성해 주세요.'],
    stats: {
      charCount: 0, paragraphCount: 0, sentenceCount: 0,
      imageCount: 0, wordCount: 0, avgSentenceLength: 0, emojiCount: 0
    },
    hookDetection: {
      type: HOOK_TYPES.UNKNOWN,
      confidence: 0,
      firstSentence: '',
      matchedPattern: null,
      reasons: ['empty']
    },
    warnings: ['empty']
  }
}

// -----------------------------------------------------------------------------
// Internal helpers
// -----------------------------------------------------------------------------

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v))
}
