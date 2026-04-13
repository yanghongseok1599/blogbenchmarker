// extension/lib/analyzers/nlp-utils.js
// 한국어 텍스트 NLP 유틸 — 순수 함수 집합
// 원칙: DOM / chrome API / 전역 상태 의존 금지. 같은 입력 → 같은 출력.
// 참조: .claude/skills/seo-analyzer-rules §4 (형태소 경량 구현)
//
// 모든 정규식은 ReDoS 안전: 앵커($ 또는 \b) + 문자 클래스 + 반복 한계.

// -----------------------------------------------------------------------------
// 상수 — 조사, 불용어, 이모지, 동사/형용사 어미
// -----------------------------------------------------------------------------

// 한국어 조사(단어 말미에서만 매치) — $ 앵커로 DoS 방지
const JOSA =
  /(을|를|이|가|은|는|에서|에게|에|의|와|과|로|으로|도|만|까지|부터|처럼|같이|보다|마다|조차|라도|나마|이나|나|든지|든|라는)$/

// 불용어 (2자 이상 토큰 기준)
const STOPWORDS = new Set([
  '이','그','저','것','들','수','및','등','또','더','좀',
  '거','게','걸','뭐','왜','어','음','아','그리고','하지만','그런데',
  '정말','진짜','너무','아주','매우','또한','대한','위한','위해',
  '때문','경우','통해','사이','정도','하나','모두','전혀'
])

// 유니코드 이모지 범위 (u 플래그 필수)
const EMOJI_RE =
  /[\u{1F300}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F000}-\u{1F2FF}\u{1F700}-\u{1F77F}]/gu

// 동사/형용사 어미 — $ 앵커
const VERB_ENDING = /(하다|이다|된다|했다|였다|한다|합니다|했습니다|됩니다|입니다|해요|돼요|된다)$/
const ADJ_ENDING = /(스럽다|롭다|답다|하다|지다|스러워|로워)$/

// 수치 패턴 (예: 30%, 3배, 10명) — 반복 상한 명시
const NUMERIC_UNIT_RE = /\b\d{1,6}(?:[.,]\d{1,3})?\s*(?:%|퍼센트|배|명|년|월|일|원|개|건|회|시간|분)\b/

// -----------------------------------------------------------------------------
// 기본 정규화
// -----------------------------------------------------------------------------

/**
 * 연속 공백을 단일 공백으로, 양끝 trim. null/undefined 안전.
 */
export function normalizeText(text) {
  if (!text) return ''
  return String(text).replace(/\s+/g, ' ').trim()
}

// -----------------------------------------------------------------------------
// 문장 분리
// -----------------------------------------------------------------------------

/**
 * 문장 단위 분리. 마침표/물음표/느낌표(한·영) + 공백 기준.
 * 줄바꿈도 보조 구분자.
 */
export function splitSentences(text) {
  if (!text) return []
  const normalized = String(text).replace(/\s+/g, ' ').trim()
  if (!normalized) return []
  // lookbehind + 공백: 종결 부호 뒤 공백에서만 분리 (소수점/축약 방지)
  return normalized
    .split(/(?<=[.!?。！？])\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 0)
}

// -----------------------------------------------------------------------------
// 단어 토큰 / 조사 제거 / 키워드 빈도
// -----------------------------------------------------------------------------

/**
 * 단어 말미의 조사를 제거한다. 2자 미만은 그대로 반환.
 */
export function stripJosa(word) {
  if (!word || word.length < 2) return word || ''
  return String(word).replace(JOSA, '')
}

/**
 * 본문을 의미 있는 토큰 배열로 변환.
 *   - 공백 분리
 *   - 구두점·특수문자 제거 (한글·영문·숫자만 유지)
 *   - 조사 제거
 *   - 2자 미만 / 불용어 / 숫자 단독 토큰 제외
 */
export function tokenizeWords(text) {
  const t = normalizeText(text)
  if (!t) return []
  return t
    .split(/\s+/)
    .map(w => w.replace(/[^\w가-힣]/g, ''))
    .map(stripJosa)
    .filter(w => w.length >= 2 && !STOPWORDS.has(w) && !/^\d+$/.test(w))
}

/**
 * 상위 키워드 빈도 (기본 상위 10개).
 * 반환: [{ word, count }, ...] — 내림차순.
 */
export function topKeywords(text, n = 10) {
  const words = tokenizeWords(text)
  const freq = new Map()
  for (const w of words) freq.set(w, (freq.get(w) ?? 0) + 1)
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, Math.max(0, n))
    .map(([word, count]) => ({ word, count }))
}

// -----------------------------------------------------------------------------
// 문장 길이 통계 / 문장 유형 분포
// -----------------------------------------------------------------------------

export function avgSentenceLength(text) {
  const sentences = splitSentences(text)
  if (sentences.length === 0) return 0
  const total = sentences.reduce((acc, s) => acc + s.length, 0)
  return Math.round((total / sentences.length) * 10) / 10
}

/**
 * 문장 종결 부호 기반 분포 (합 = 1.0).
 */
export function sentenceDistribution(text) {
  const sentences = splitSentences(text)
  const total = sentences.length
  if (total === 0) return { declarative: 0, question: 0, exclamation: 0 }
  let q = 0
  let e = 0
  for (const s of sentences) {
    if (/[?？]\s*$/.test(s)) q++
    else if (/[!！]\s*$/.test(s)) e++
  }
  const d = total - q - e
  return {
    declarative: round2(d / total),
    question: round2(q / total),
    exclamation: round2(e / total)
  }
}

// -----------------------------------------------------------------------------
// 글자 수 / 단락 수 / 이모지 / 동사·형용사
// -----------------------------------------------------------------------------

/**
 * 공백을 제외한 글자 수 (네이버 블로그 기준).
 */
export function countCharacters(text) {
  if (!text) return 0
  return String(text).replace(/\s/g, '').length
}

/**
 * 빈 줄(연속 줄바꿈) 기준 단락 수.
 */
export function countParagraphs(text) {
  if (!text) return 0
  return String(text)
    .split(/\n{2,}/)
    .filter(p => p.trim().length > 0)
    .length
}

export function countEmojis(text) {
  if (!text) return 0
  const matches = String(text).match(EMOJI_RE)
  return matches ? matches.length : 0
}

/**
 * 단순 동사·형용사 카운트 (어미 기반 heuristic).
 * 완전한 형태소 분석은 아니지만 경향 파악에는 충분.
 */
export function countVerbsAndAdjectives(text) {
  if (!text) return { verbs: 0, adjectives: 0 }
  let verbs = 0
  let adjectives = 0
  const words = String(text).split(/\s+/)
  for (const w of words) {
    if (!w) continue
    if (VERB_ENDING.test(w)) verbs++
    if (ADJ_ENDING.test(w)) adjectives++
  }
  return { verbs, adjectives }
}

// -----------------------------------------------------------------------------
// 수치 패턴 (통계·신뢰성 점수에서 사용)
// -----------------------------------------------------------------------------

export function hasNumericPattern(text) {
  if (!text) return false
  return NUMERIC_UNIT_RE.test(String(text))
}

// -----------------------------------------------------------------------------
// Internal
// -----------------------------------------------------------------------------

function round2(n) {
  return Math.round(n * 100) / 100
}

// 외부 공개 상수 (테스트/확장 용)
export { STOPWORDS, JOSA, EMOJI_RE, NUMERIC_UNIT_RE }
