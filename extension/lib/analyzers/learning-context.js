// extension/lib/analyzers/learning-context.js
// 학습 데이터 N건에서 사용자의 글 스타일 특성을 추출한다.
// 결과는 generate-content Edge Function 의 프롬프트 컨텍스트로 전달된다.
//
// 출력:
//   {
//     styleProfile: {
//       avgSentenceLen: number,                // 학습본 전체 평균 문장 길이(글자 수)
//       topKeywords:    string[],              // 빈도 상위 10개
//       hookPatterns:   { type, count, ratio }[],  // 첫 문단 후킹 타입 분포
//       sampleCount:    number,                // 분석에 사용된 학습본 수
//       refSnippets:    { title, excerpt }[]   // Edge Function 에 전달할 발췌(최대 3개, 각 500자)
//     }
//   }
//
// 원칙: 순수 함수. DOM/chrome/fetch 의존 금지. 모든 NLP 는 nlp-utils + hook-detector 위임.

import { topKeywords as topKeywordsFromText, avgSentenceLength } from './nlp-utils.js'
import { detectHook } from './hook-detector.js'

const MAX_REF_SNIPPETS = 3       // edge_function_contracts §1.1 learningRefs 최대 3
const REF_SNIPPET_LEN = 500       // 각 500자
const TOP_KEYWORDS_N = 10
const FIRST_PARAGRAPH_MAX_CHARS = 800

/**
 * @typedef {Object} LearningRecord
 * @property {string} id
 * @property {{ title: string, content: string }} content_json
 * @property {string[]} [keywords]
 * @property {Object} [meta]
 */

/**
 * 학습 N건 → 스타일 프로파일.
 * @param {LearningRecord[]} learnings
 * @returns {{ styleProfile: {
 *   avgSentenceLen: number,
 *   topKeywords: string[],
 *   hookPatterns: { type: string, count: number, ratio: number }[],
 *   sampleCount: number,
 *   refSnippets: { title: string, excerpt: string }[]
 * }}}
 */
export function extractStyleProfile(learnings) {
  const valid = sanitizeRecords(learnings)
  if (valid.length === 0) {
    return {
      styleProfile: {
        avgSentenceLen: 0,
        topKeywords: [],
        hookPatterns: [],
        sampleCount: 0,
        refSnippets: [],
      },
    }
  }

  // 1) 본문 누적 → 키워드 빈도 + 평균 문장 길이
  const allText = valid.map((r) => r.content_json.content).join('\n\n')
  const avgLen = avgSentenceLength(allText)
  const kwResult = topKeywordsFromText(allText, TOP_KEYWORDS_N)
  // 사용자가 직접 저장한 keywords 도 가중 (1.5배) 후 합산
  const merged = mergeKeywords(kwResult, valid.flatMap((r) => r.keywords ?? []))

  // 2) 후킹 타입 분포 — 각 글의 첫 문단만 detect
  const hookPatterns = computeHookDistribution(valid)

  // 3) 발췌 — 최신순 가정(호출자가 정렬) 상위 3건, 각 500자
  const refSnippets = valid
    .slice(0, MAX_REF_SNIPPETS)
    .map((r) => ({
      title: clampStr(r.content_json.title || '(제목 없음)', 200),
      excerpt: clampStr(r.content_json.content, REF_SNIPPET_LEN),
    }))
    .filter((s) => s.excerpt.length > 0)

  return {
    styleProfile: {
      avgSentenceLen: avgLen,
      topKeywords: merged.slice(0, TOP_KEYWORDS_N).map((k) => k.word),
      hookPatterns,
      sampleCount: valid.length,
      refSnippets,
    },
  }
}

/**
 * Edge Function 호출용 learningRefs 만 따로 추출 (생성 핸들러가 그대로 options.learningRefs 로 전달).
 * @param {LearningRecord[]} learnings
 * @returns {string[]}
 */
export function buildLearningRefs(learnings) {
  const profile = extractStyleProfile(learnings).styleProfile
  return profile.refSnippets.map((s) => `# ${s.title}\n${s.excerpt}`).slice(0, MAX_REF_SNIPPETS)
}

// ─────────────────────────────────────────────────────────────
// 내부
// ─────────────────────────────────────────────────────────────

function sanitizeRecords(learnings) {
  if (!Array.isArray(learnings)) return []
  return learnings
    .filter((r) => r && r.content_json && typeof r.content_json === 'object')
    .map((r) => ({
      id: String(r.id ?? ''),
      content_json: {
        title: typeof r.content_json.title === 'string' ? r.content_json.title : '',
        content: typeof r.content_json.content === 'string' ? r.content_json.content : '',
      },
      keywords: Array.isArray(r.keywords) ? r.keywords.filter((v) => typeof v === 'string') : [],
      meta: r.meta && typeof r.meta === 'object' ? r.meta : {},
    }))
    .filter((r) => r.content_json.title || r.content_json.content)
}

/**
 * 본문 빈도 키워드 + 사용자 저장 키워드 가중 결합.
 * 동일 단어는 (count + saved*1.5) 로 합산 후 정렬.
 * @param {{ word: string, count: number }[]} fromText
 * @param {string[]} userKeywords
 */
function mergeKeywords(fromText, userKeywords) {
  /** @type {Map<string, number>} */
  const map = new Map()
  for (const { word, count } of fromText) {
    if (!word) continue
    map.set(word, (map.get(word) ?? 0) + Number(count || 0))
  }
  for (const raw of userKeywords) {
    const w = String(raw || '').trim()
    if (!w) continue
    map.set(w, (map.get(w) ?? 0) + 1.5)
  }
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([word, count]) => ({ word, count }))
}

/**
 * 학습본 N개의 첫 문단을 detectHook 으로 분류해 분포 산출.
 */
function computeHookDistribution(records) {
  /** @type {Map<string, number>} */
  const counts = new Map()
  for (const r of records) {
    const fp = extractFirstParagraph(r.content_json.content)
    if (!fp) continue
    let detection
    try {
      detection = detectHook(fp)
    } catch {
      continue
    }
    const type = detection?.type ?? 'unknown'
    counts.set(type, (counts.get(type) ?? 0) + 1)
  }
  const total = [...counts.values()].reduce((a, b) => a + b, 0)
  if (total === 0) return []
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([type, count]) => ({
      type,
      count,
      ratio: Math.round((count / total) * 100) / 100,
    }))
}

function extractFirstParagraph(text) {
  if (!text) return ''
  const trimmed = String(text).trim()
  const para = trimmed.split(/\n{2,}/)[0] || trimmed
  return para.slice(0, FIRST_PARAGRAPH_MAX_CHARS)
}

function clampStr(value, max) {
  if (value == null) return ''
  return String(value).slice(0, max)
}
