// extension/content/analyzer.js
// 콘텐츠 스크립트에서 호출되는 분석 진입점.
// 책임: extractor 로 DOM 파싱 → seo-analyzer 로 점수 계산 → { ok, data/error } 반환.
// background/handlers/analyze-handler.js 가 이 모듈을 경유해 사이드패널 UI 로 결과 전달.
//
// 원칙:
//   - 이 파일은 얇은 어댑터. 분석 로직은 lib/analyzers 에 위임.
//   - 실패 경로도 유효한 shape 유지 (크래시 금지, 사용자 친화 메시지).

import { extract, detectEditorVersion } from './extractor.js'
import { analyze as analyzeSeo } from '../lib/analyzers/seo-analyzer.js'

/**
 * 현재 페이지를 분석한다.
 *
 * Phase 7: options.saveToLearning + options.ownContent 가 둘 다 true 일 때
 * 분석 성공 직후 'learning.save' 메시지를 background 로 dispatch 한다.
 * **저작권 안전:** ownContent 플래그가 true 가 아니면 저장 경로는 절대 발화하지 않는다.
 *
 * @param {Document} [doc] 테스트·재사용을 위해 주입 가능
 * @param {Object}   [options]
 * @param {string}   [options.keyword]            기존 SEO 키워드 옵션
 * @param {boolean}  [options.saveToLearning]     true 면 learning_data 에 INSERT 시도
 * @param {boolean}  [options.ownContent]         true 일 때만 저장 허용 (저작권 게이트)
 * @returns {{ok: true, data: AnalysisResult} | {ok: false, error: string, code: string, data?: any}}
 */
export function runAnalysis(
  doc = (typeof document !== 'undefined' ? document : null),
  options = {}
) {
  const startedAt = Date.now()
  const editorVersion = detectEditorVersion(doc)
  const payload = extract(doc)

  if (!payload.title && !payload.content) {
    return {
      ok: false,
      error: '블로그 본문을 찾지 못했습니다. 네이버 블로그 글 페이지에서 다시 시도해 주세요.',
      code: 'content_not_found',
      data: { editorVersion }
    }
  }

  const keyword = typeof options?.keyword === 'string' ? options.keyword : null
  const meta = { ...payload.meta, keyword }

  let result
  try {
    result = analyzeSeo({
      title: payload.title,
      content: payload.content,
      meta,
      images: payload.images
    })
  } catch (err) {
    // 방어적: 내부 분석 로직은 순수 함수라 예외 드물지만 크래시 방지.
    return {
      ok: false,
      error: '분석 중 오류가 발생했습니다. 페이지를 새로고침 후 다시 시도해 주세요.',
      code: 'analyzer_exception',
      data: { editorVersion, message: err?.message }
    }
  }

  // saveToLearning + ownContent 양쪽이 true 일 때만 학습 저장 dispatch
  const saveToLearning = options?.saveToLearning === true
  const ownContent = options?.ownContent === true
  const saved = saveToLearning && ownContent
    ? dispatchLearningSave({
        title: payload.title,
        content: payload.content,
        keywords: extractKeywordList(result),
        meta: {
          sourceUrl: payload.meta?.url ?? null,
          totalScore: result?.totalScore ?? null,
          editorVersion,
        },
      })
    : null

  return {
    ok: true,
    data: {
      ...result,
      source: {
        url:           payload.meta.url,
        editorVersion,
        title:         payload.title,
        imageCount:    payload.images.length,
        elapsedMs:     Date.now() - startedAt
      },
      saveToLearning: saved !== null,
      learningSaved: null   // 백그라운드 응답을 기다리지 않으므로 항상 null. 후속 메시지로 갱신.
    }
  }
}

/**
 * background/handlers/learning-handler.js 의 'learning.save' 를 호출한다.
 * fire-and-forget — content script 는 응답을 기다리지 않는다.
 * 메시지는 ownContent: true 를 명시 — handler 측 게이트와 일치시킨다.
 * @param {{ title: string, content: string, keywords?: string[], meta?: Object }} payload
 * @returns {true | null} dispatch 시도 여부
 */
function dispatchLearningSave(payload) {
  if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) {
    return null
  }
  try {
    chrome.runtime.sendMessage(
      { action: 'learning.save', payload: { ownContent: true, ...payload } },
      () => {
        // 응답은 무시 — 단 lastError 는 읽어 unhandled error 로그 회피.
        void chrome.runtime.lastError
      },
    )
    return true
  } catch {
    return null
  }
}

/**
 * 분석 결과의 상위 키워드를 평탄한 문자열 배열로 변환한다.
 * @param {Object} result seo-analyzer 결과
 * @returns {string[]}
 */
function extractKeywordList(result) {
  // seo-analyzer 의 keywordDensity 섹션이 가장 일반적인 키워드 소스.
  const fromStats = result?.stats?.topKeywords
  if (Array.isArray(fromStats)) {
    return fromStats
      .map((k) => (typeof k === 'string' ? k : k?.word))
      .filter((v) => typeof v === 'string' && v)
      .slice(0, 20)
  }
  return []
}

// 재export — background handler 가 DOM 추출만 필요한 경우(경쟁 블로그 스크래핑 등)에 사용
export { extract as extractBlog, detectEditorVersion }
