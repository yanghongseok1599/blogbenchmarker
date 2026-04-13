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
 * @param {Document} [doc] - 테스트·재사용 위해 주입 가능
 * @param {Object}   [options] - { keyword: string }
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
      }
    }
  }
}

// 재export — background handler 가 DOM 추출만 필요한 경우(경쟁 블로그 스크래핑 등)에 사용
export { extract as extractBlog, detectEditorVersion }
