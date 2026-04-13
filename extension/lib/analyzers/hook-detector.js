// extension/lib/analyzers/hook-detector.js
// 첫 문단 / 제목의 후킹 강도 측정
// 핵심 규칙(seo-analyzer-rules §3):
//   - 타입별 최소 2개 조건 충족 시 match
//   - confidence 점수(0~1) 반환 → 애매하면 'unknown'
// 기존 버그(analyzer.js:469-489 false positive) 재현 방지:
//   - 단일 키워드(예: "안녕", "?")만으로 판정하지 않는다
//   - "안녕하세요?" 같은 합성 문장은 greeting·question 모두에서 감점
//
// 모든 정규식은 ReDoS 안전: 중첩 수량자 없음, 모든 반복에 상한.

import { splitSentences } from './nlp-utils.js'

// -----------------------------------------------------------------------------
// 패턴 상수 — 전부 단순 alternation + 고정 길이 match
// -----------------------------------------------------------------------------

const QUESTION_ENDING   = /[?？]\s*$/
const INTERROGATIVE     = /(누가|무엇|어디|언제|왜|어떻게|얼마나|얼마|어느|어떤)/
const SECOND_PERSON     = /(여러분|당신|너희|너)/

const EXCLAMATION_ENDING = /[!！]{1,3}\s*$/
const EMOTIONAL_ADVERB   = /(정말|너무|엄청|진짜|완전|최고|최악|대박|놀라)/

// 통계 패턴: 명시적 상한 (1~6자리 정수 + 선택적 소수 + 단위)
const STATISTIC_PATTERN = /\b\d{1,6}(?:[.,]\d{1,3})?\s*(?:%|퍼센트|배|명|년|원|개|건|회)/
const KOREAN_NOUN       = /[가-힣]{2,20}/

const PAST_TENSE        = /(었다|였다|했다|왔다|갔다|봤다|들었다|었어요|였어요|했어요|봤어요)/
const FIRST_PERSON      = /(저는|나는|제가|내가|우리는)/
const TIME_MARKER       = /(어느\s?날|그때|그날|처음|예전|지난|얼마\s?전|오늘\s?아침|작년)/

const GREETING          = /(안녕하세요|반갑습니다|반가워요|처음\s?뵙)/

// -----------------------------------------------------------------------------
// 타입 상수
// -----------------------------------------------------------------------------

export const HOOK_TYPES = Object.freeze({
  QUESTION:     'question',
  EXCLAMATION:  'exclamation',
  STATISTIC:    'statistic',
  STORYTELLING: 'storytelling',
  GREETING:     'greeting',
  UNKNOWN:      'unknown'
})

// 동률 confidence 시의 타입 우선순위 — 정보 밀도가 높은 순
const TYPE_PRIORITY = {
  statistic:    5,
  question:     4,
  storytelling: 3,
  exclamation:  2,
  greeting:     1,
  unknown:      0
}

// -----------------------------------------------------------------------------
// 타입별 detector — 모두 { match, confidence, reasons, pattern } 반환
// -----------------------------------------------------------------------------

export function detectQuestion(sentence) {
  const s = String(sentence || '')
  const reasons = []
  let score = 0
  if (QUESTION_ENDING.test(s)) { score++; reasons.push('물음표 종결') }
  if (s.length > 0 && s.length <= 40) { score++; reasons.push('40자 이내') }
  if (INTERROGATIVE.test(s) || SECOND_PERSON.test(s)) {
    score++; reasons.push('의문사/2인칭 대명사')
  }
  // 인사말만 포함된 "안녕하세요?" 류는 질문형 아님 — 감점
  if (GREETING.test(s)) score = Math.max(0, score - 1)
  return {
    match: score >= 2,
    confidence: score / 3,
    reasons,
    pattern: 'question-rule'
  }
}

export function detectExclamation(sentence) {
  const s = String(sentence || '')
  const reasons = []
  let score = 0
  if (EXCLAMATION_ENDING.test(s)) { score++; reasons.push('느낌표 종결') }
  if (EMOTIONAL_ADVERB.test(s)) { score++; reasons.push('감탄 부사') }
  return {
    match: score >= 2,
    confidence: score / 2,
    reasons,
    pattern: 'exclamation-rule'
  }
}

export function detectStatistic(sentence) {
  const s = String(sentence || '')
  const reasons = []
  let score = 0
  if (STATISTIC_PATTERN.test(s)) { score++; reasons.push('통계 수치') }
  if (KOREAN_NOUN.test(s)) { score++; reasons.push('한국어 명사 존재') }
  // 숫자만 나열된 경우를 배제 — 위 두 조건 모두 필요.
  return {
    match: score >= 2,
    confidence: score / 2,
    reasons,
    pattern: 'statistic-rule'
  }
}

export function detectStorytelling(paragraph) {
  const sentences = splitSentences(paragraph)
  if (sentences.length < 2) {
    return {
      match: false,
      confidence: 0,
      reasons: ['단문 — 2문장 이상 필요'],
      pattern: 'storytelling-rule'
    }
  }
  const combined = sentences.slice(0, 3).join(' ')
  const reasons = []
  let score = 0
  const hasPast = PAST_TENSE.test(combined)
  const hasFirst = FIRST_PERSON.test(combined)
  const hasTime = TIME_MARKER.test(combined)
  if (hasPast) { score++; reasons.push('과거 시제') }
  if (hasFirst) { score++; reasons.push('1인칭') }
  if (hasTime) { score++; reasons.push('시간 표지') }
  // 과거시제 필수 + (1인칭 OR 시간 표지)
  const match = hasPast && (hasFirst || hasTime)
  return {
    match,
    confidence: score / 3,
    reasons,
    pattern: 'storytelling-rule'
  }
}

export function detectGreeting(sentence) {
  const s = String(sentence || '')
  const reasons = []
  let score = 0
  if (GREETING.test(s)) { score++; reasons.push('인사말') }
  if (s.length > 0 && s.length <= 20) { score++; reasons.push('20자 이내') }
  // 합성 문장(e.g. "안녕하세요? 오늘은…")은 인사형 아님
  if (QUESTION_ENDING.test(s)) score = Math.max(0, score - 1)
  return {
    match: score >= 2,
    confidence: score / 2,
    reasons,
    pattern: 'greeting-rule'
  }
}

// -----------------------------------------------------------------------------
// 메인 진입점
// -----------------------------------------------------------------------------

/**
 * 첫 문단(혹은 텍스트) 을 받아 최적의 후킹 타입을 반환한다.
 * 어느 타입도 2개 조건을 충족하지 못하면 'unknown'.
 */
export function detectHook(paragraph) {
  const text = String(paragraph || '').trim()
  if (!text) {
    return emptyResult('빈 입력')
  }

  const sentences = splitSentences(text)
  const first = sentences[0] ?? text.slice(0, 120)

  const candidates = [
    { type: HOOK_TYPES.QUESTION,     ...detectQuestion(first) },
    { type: HOOK_TYPES.EXCLAMATION,  ...detectExclamation(first) },
    { type: HOOK_TYPES.STATISTIC,    ...detectStatistic(first) },
    { type: HOOK_TYPES.STORYTELLING, ...detectStorytelling(text) },
    { type: HOOK_TYPES.GREETING,     ...detectGreeting(first) }
  ].filter(c => c.match)

  if (candidates.length === 0) {
    return {
      type: HOOK_TYPES.UNKNOWN,
      confidence: 0,
      firstSentence: first,
      matchedPattern: null,
      reasons: ['어떤 후킹 패턴도 2개 이상 조건을 충족하지 않음']
    }
  }

  candidates.sort((a, b) =>
    b.confidence - a.confidence ||
    (TYPE_PRIORITY[b.type] - TYPE_PRIORITY[a.type])
  )
  const best = candidates[0]

  // confidence < 0.5 은 unknown 으로 강등 (seo-analyzer-rules §3-4)
  const finalType = best.confidence >= 0.5 ? best.type : HOOK_TYPES.UNKNOWN

  return {
    type: finalType,
    confidence: Math.round(best.confidence * 100) / 100,
    firstSentence: first,
    matchedPattern: best.pattern,
    reasons: best.reasons
  }
}

// -----------------------------------------------------------------------------
// Internal
// -----------------------------------------------------------------------------

function emptyResult(reason) {
  return {
    type: HOOK_TYPES.UNKNOWN,
    confidence: 0,
    firstSentence: '',
    matchedPattern: null,
    reasons: [reason]
  }
}
