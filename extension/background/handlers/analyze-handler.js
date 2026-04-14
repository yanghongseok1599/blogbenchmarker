// background/handlers/analyze-handler.js
// 분석(action: 'analyze.post') 핸들러.
//
// 흐름:
//   1) 메시지로 전달된 url 대상 탭을 찾는다(없으면 현재 활성 탭 사용).
//   2) chrome.scripting.executeScript 로 탭의 모든 프레임에서 DOM 을 추출한다.
//      - 네이버 블로그는 iframe 구조라 main frame 에는 본문이 없음 → allFrames: true 필수.
//   3) 추출된 프레임 결과 중 본문이 가장 긴 프레임을 선택.
//   4) seo-analyzer 에 넘겨 점수 계산.
//   5) UI 에서 기대하는 shape 으로 변환해 반환.
//
// 보안:
//   - content_script 로 모든 로직을 넣지 않고, handler 가 executeScript 로 최소 추출만 실행.
//   - 추출된 텍스트는 textContent 기반이라 XSS 위험 없음.

import { analyze as analyzeSeo } from '../../lib/analyzers/seo-analyzer.js'
import { analyzeStructure } from '../../lib/analyzers/structure-analyzer.js'

const NAVER_BLOG_HOST_RE = /^(?:m\.)?(?:[a-z0-9-]+\.)?blog\.naver\.com$/i

/**
 * 네이버 블로그 DOM 에서 title/content/images/meta 추출.
 * 이 함수는 chrome.scripting.executeScript 로 탭의 MAIN world 에서 실행되므로
 * 외부 변수를 참조하지 말 것(클로저 캡처 불가).
 */
function extractFromDOM() {
  const TITLE_SELECTORS = [
    '.se-title-text',                // SmartEditor ONE (신규)
    '.se_title',                     // SmartEditor 2.x
    'h3.se_textarea',                // SmartEditor 2.x 대체
    '.pcol1',                        // 구 에디터
    '.htitle',                       // 모바일
    'h1, h2, h3',                    // fallback
  ]
  const CONTENT_SELECTORS = [
    '.se-main-container',            // SmartEditor ONE
    '.se_component_wrap',            // SmartEditor 2.x
    '.post_body',                    // 구 에디터
    '#postViewArea',                 // 구 에디터 대체
    '.view',                         // 모바일
    'article',                       // 시맨틱 fallback
  ]

  function findFirst(selectors) {
    for (const sel of selectors) {
      const el = document.querySelector(sel)
      if (el && el.textContent && el.textContent.trim().length > 0) return el
    }
    return null
  }

  const titleEl = findFirst(TITLE_SELECTORS)
  const contentEl = findFirst(CONTENT_SELECTORS)

  const title = titleEl?.textContent?.trim() || ''

  // ─────────────────────────────────────────────────────────
  // 본문 블록 추출 — leaf 블록만 선택해 중첩 중복을 원천 차단.
  // 기존엔 .se-component / .se-module-text 같은 상위 컨테이너도 포함해
  // 하나의 단락이 2~3번 집계되어 paragraphCount 가 211개까지 부풀었다.
  // 이제는 실제 말단(리프) 블록만 수집한다.
  // ─────────────────────────────────────────────────────────
  function extractBlockedText(root) {
    if (!root) return ''
    const LEAF_BLOCK_SELECTOR = [
      'div.se-text-paragraph',   // SmartEditor ONE 문단 (리프)
      'p:not(:empty)',           // SmartEditor 2.x / legacy 문단
      'li',                      // 목록 아이템
      'blockquote',              // 인용
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      '.se-quote',               // SmartEditor 인용
    ].join(',')
    const blocks = root.querySelectorAll(LEAF_BLOCK_SELECTOR)
    if (blocks.length === 0) {
      return (root.innerText || root.textContent || '').trim()
    }
    // 공백 정규화: 연속 공백 → 단일, 양끝 trim.
    const normalizeWs = (s) => String(s || '').replace(/\s+/g, ' ').trim()

    const lines = []
    blocks.forEach((el) => {
      const t = normalizeWs(el.textContent || '')
      if (t && t.length > 0) lines.push(t)
    })
    // 중복 제거 (정규화된 텍스트 기준)
    const seen = new Set()
    const dedup = []
    for (const l of lines) {
      if (seen.has(l)) continue
      seen.add(l)
      dedup.push(l)
    }
    return dedup.join('\n')
  }

  const content = extractBlockedText(contentEl)

  if (!content) {
    return { title: '', content: '', images: [], meta: { url: location.href } }
  }

  // ─────────────────────────────────────────────────────────
  // 이미지 필터링 — 본문 외 이미지(아바타/아이콘/스티커/스프라이트/광고/썸네일)를
  // 제외해 관련도 있는 본문 이미지만 반환한다.
  // 기존 60개(아바타·광고 포함) → 평균 ~10개 수준으로 정제.
  // ─────────────────────────────────────────────────────────
  const EXCLUDE_ALT_TOKENS = ['이모티콘', '스티커', '이모지']
  const EXCLUDE_URL_RE = /\/(icon|sticker|profile)\/|sprites?|emoticon/i
  const MIN_BODY_IMG_SIZE = 100

  function imageDisplaySize(img) {
    const attrW = parseInt(img.getAttribute('width') || '', 10)
    const attrH = parseInt(img.getAttribute('height') || '', 10)
    if (Number.isFinite(attrW) && Number.isFinite(attrH) && attrW > 0 && attrH > 0) {
      return { w: attrW, h: attrH }
    }
    const cw = img.clientWidth || 0
    const ch = img.clientHeight || 0
    if (cw > 0 && ch > 0) return { w: cw, h: ch }
    return { w: img.naturalWidth || 0, h: img.naturalHeight || 0 }
  }

  function isBodyImage(img) {
    const src = img.currentSrc || img.src || ''
    if (!src || src.startsWith('data:')) return false

    const alt = (img.alt || '').trim()
    for (const bad of EXCLUDE_ALT_TOKENS) {
      if (alt.includes(bad)) return false
    }
    if (EXCLUDE_URL_RE.test(src)) return false

    // 사이즈 검증: 값을 얻은 경우에만 필터 (lazy-load 로 0 이면 trust URL/alt 필터)
    const { w, h } = imageDisplaySize(img)
    if (w > 0 && w < MIN_BODY_IMG_SIZE) return false
    if (h > 0 && h < MIN_BODY_IMG_SIZE) return false

    return true
  }

  // 우선순위 셀렉터 (본문 이미지로 확인된 슬롯)
  const PRIORITY_IMG_SELECTOR = [
    '.se-image img',           // SmartEditor ONE 이미지 컨테이너
    'img.se-image-resource',   // img 자체가 se-image-resource 클래스
    '.se-image-resource img',  // 중첩 대비
    'img.egjs-visible',        // 구버전 slider 이미지
  ].join(', ')

  let imgPool = contentEl
    ? Array.from(contentEl.querySelectorAll(PRIORITY_IMG_SELECTOR))
    : []
  if (imgPool.length === 0 && contentEl) {
    // 폴백: contentEl 내 모든 img 중 필터 통과분
    imgPool = Array.from(contentEl.querySelectorAll('img'))
  }

  const seenImgSrcs = new Set()
  const images = []
  for (const img of imgPool) {
    if (!isBodyImage(img)) continue
    const src = img.currentSrc || img.src || ''
    if (seenImgSrcs.has(src)) continue
    seenImgSrcs.add(src)
    images.push({ src, alt: img.alt || '' })
    if (images.length >= 50) break
  }

  // 태그 / 키워드 추출 (블로그 상단의 태그 영역)
  const tagEls = document.querySelectorAll('.post_tag .item, .wrap_tag a, .tag_area a')
  const tags = Array.from(tagEls)
    .map((a) => a.textContent?.trim().replace(/^#/, ''))
    .filter(Boolean)
    .slice(0, 20)

  return {
    title,
    content,
    images,
    meta: {
      url: location.href,
      tags,
    },
  }
}

/**
 * 대상 탭 조회: payload.url 이 있으면 해당 URL 일치, 없으면 현재 활성 탭.
 * @param {{ url?: string }} payload
 */
async function resolveTargetTab(payload) {
  if (payload?.url) {
    const tabs = await chrome.tabs.query({ url: payload.url })
    if (tabs.length > 0) return tabs[0]
  }
  const activeTabs = await chrome.tabs.query({ active: true, currentWindow: true })
  return activeTabs[0] ?? null
}

/**
 * SEO 분석 결과를 사이드패널이 기대하는 shape 으로 변환.
 * { totalScore, sections[], stats, url, title }
 */
function buildUiShape({ url, title, stats, analysis, structure }) {
  const s = analysis.sections || {}
  const sections = [
    s.titleSeo       && { key: 'titleSeo',       title: '제목 SEO',      score: s.titleSeo.score,       recommendations: s.titleSeo.recommendations || [] },
    s.hookScore      && { key: 'hookScore',      title: '후킹 (첫 문단)', score: s.hookScore.score,      recommendations: s.hookScore.recommendations || [] },
    s.contentSeo     && { key: 'contentSeo',     title: '본문 SEO',      score: s.contentSeo.score,     recommendations: s.contentSeo.recommendations || [] },
    s.readability    && { key: 'readability',    title: '가독성',        score: s.readability.score,    recommendations: s.readability.recommendations || [] },
    s.keywordDensity && { key: 'keywordDensity', title: '키워드 밀도',   score: s.keywordDensity.score, recommendations: s.keywordDensity.recommendations || [] },
  ].filter(Boolean)

  return {
    url: url || '',
    title: title || '(제목 없음)',
    totalScore: Math.round(analysis.totalScore || 0),
    sections,
    stats: stats || analysis.stats || {},
    recommendations: analysis.recommendations || [],
    warnings: analysis.warnings || [],
    structure: structure || null,
  }
}

/**
 * 직접 전달된 title + body(content) 로 분석 수행.
 * writing-page sidebar-bridge 에서 실시간 편집 중인 내용을 분석할 때 사용.
 */
function analyzeDirect({ title = '', content = '', images = [], url = '' }) {
  const analysis = analyzeSeo({ title, content, images })
  const structure = analyzeStructure({ title, content, images })
  return buildUiShape({
    url,
    title,
    stats: analysis.stats,
    analysis,
    structure,
  })
}

/**
 * 분석 메인.
 * @param {{ url?: string, title?: string, body?: string, content?: string }} payload
 */
async function analyzePost(payload) {
  // 직접 모드: 작성 중인 글을 title+body 로 바로 전달받은 경우(글쓰기 사이드바)
  const directTitle = payload?.title
  const directBody = payload?.body ?? payload?.content
  if (typeof directTitle === 'string' && typeof directBody === 'string') {
    return analyzeDirect({
      title: directTitle,
      content: directBody,
      url: payload.url || '',
    })
  }

  const tab = await resolveTargetTab(payload)
  if (!tab?.id) throw new Error('활성 탭을 찾을 수 없습니다.')

  // 네이버 블로그 URL 검증 (보안/UX)
  let host = ''
  try { host = new URL(tab.url || '').hostname } catch { /* ignore */ }
  if (!NAVER_BLOG_HOST_RE.test(host)) {
    throw new Error('네이버 블로그 페이지에서만 분석할 수 있습니다.')
  }

  // 모든 프레임에서 DOM 추출 (네이버는 iframe 구조)
  let frameResults
  try {
    frameResults = await chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true },
      world: 'MAIN',
      func: extractFromDOM,
    })
  } catch (e) {
    throw new Error('페이지 추출 실패: ' + (e?.message || String(e)))
  }

  // 본문이 가장 긴 프레임 선택
  const best = frameResults
    .map((r) => r?.result)
    .filter((r) => r && r.content && r.content.length > 50)
    .sort((a, b) => b.content.length - a.content.length)[0]

  if (!best) {
    throw new Error('블로그 본문을 찾을 수 없습니다. 글 페이지에서 다시 시도해 주세요.')
  }

  const analysis = analyzeSeo({
    title: best.title,
    content: best.content,
    meta: best.meta,
    images: best.images,
  })

  const structure = analyzeStructure({
    title: best.title,
    content: best.content,
    images: best.images,
  })

  // 반환 전 sanity 로깅 — DevTools 에서 응답 품질을 빠르게 확인.
  // 큰 값이 찍히면 오인식 회귀 가능성 (paragraphCount > 100, sectionCount > 10 등).
  try {
    const st = structure || {}
    console.debug('[analyze-handler] counts', {
      url: tab.url,
      contentChars: best.content.length,
      paragraphCount: st.totals?.paragraphCount ?? 0,
      sectionCount: st.sections?.length ?? 0,
      imageCount: best.images.length,
      falsePositive: !!st.falsePositive,
    })
  } catch { /* noop */ }

  return buildUiShape({
    url: tab.url,
    title: best.title,
    stats: analysis.stats,
    analysis,
    structure,
  })
}

export const analyzeHandler = {
  post: analyzePost,
}
