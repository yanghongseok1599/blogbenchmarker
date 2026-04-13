// extension/content/extractor.js
// 네이버 블로그 DOM 에서 { title, content, images, meta } 파싱
// 지원 에디터:
//   - SmartEditor ONE  (현행 기본)          div.se-main-container
//   - 구버전 iframe    (#mainFrame)         div#postViewArea
//   - 레거시           div.post_ct
// 참조: REFERENCE.md §1 — 기존 `content/extractor.js`
//
// 원칙:
//   - 순수 함수: 전역 상태 저장 금지. document 는 인자로 주입 가능.
//   - innerHTML 사용 금지 (textContent / cloneNode / DOM API 만 사용).
//   - 여러 셀렉터 체인으로 버전 드리프트 내성 확보.

// -----------------------------------------------------------------------------
// 셀렉터 체인 — 순서대로 시도, 첫 match 채택
// -----------------------------------------------------------------------------

const TITLE_SELECTORS = [
  'div.se-title-text',                         // SmartEditor ONE
  'div.pcol1 h3 span.itemSubjectBoldfont',     // 구버전
  'h3.se_textarea',
  'span.pcol1',
  'meta[property="og:title"]'                  // fallback
]

const CONTENT_SELECTORS = [
  'div.se-main-container',                     // SmartEditor ONE
  'div#postViewArea',                          // 구버전 iframe 내부
  'div.post-view',
  'div.post_ct'                                // 레거시
]

const IMAGE_SELECTORS = [
  'div.se-main-container img.se-image-resource',
  'div.se-main-container img',
  'div#postViewArea img',
  'div.post_ct img'
]

const TAG_SELECTORS = [
  'div.post_tag a',
  'div.wrap_tag a',
  'span.tag a',
  'a.tag'
]

// 본문 텍스트 정리 시 문단 구분을 주입할 블록 요소
const BLOCK_TAGS_FOR_NEWLINE = [
  'p', 'div.se-component', 'div.se-paragraph',
  'br', 'h1', 'h2', 'h3', 'h4', 'li', 'blockquote'
]

// -----------------------------------------------------------------------------
// 문서 루트 해결 — iframe(#mainFrame) 내부면 contentDocument 반환
// -----------------------------------------------------------------------------

export function getBlogDocument(doc) {
  if (!doc) return null
  const frame = doc.querySelector('iframe#mainFrame')
  if (frame) {
    try {
      const inner = frame.contentDocument || frame.contentWindow?.document
      if (inner) return inner
    } catch (_) {
      // cross-origin — 접근 불가. 상위 document 로 폴백.
    }
  }
  return doc
}

// -----------------------------------------------------------------------------
// 셀렉터 체인 helper
// -----------------------------------------------------------------------------

function querySelectorChain(root, selectors) {
  for (const sel of selectors) {
    const el = root.querySelector(sel)
    if (el) return el
  }
  return null
}

function querySelectorAllChain(root, selectors) {
  for (const sel of selectors) {
    const els = root.querySelectorAll(sel)
    if (els && els.length > 0) return Array.from(els)
  }
  return []
}

function textOf(el) {
  if (!el) return ''
  if (el.tagName === 'META') return el.getAttribute('content') || ''
  return (el.textContent || '').replace(/\u00A0/g, ' ').trim()
}

// -----------------------------------------------------------------------------
// 개별 추출 함수 — 각자 테스트 가능
// -----------------------------------------------------------------------------

export function extractTitle(root) {
  return textOf(querySelectorChain(root, TITLE_SELECTORS))
}

/**
 * 본문 텍스트 추출. 블록 요소마다 \n\n 삽입으로 문단 구분을 보존한다.
 * 이미지·스크립트·스타일은 제거.
 */
export function extractContent(root) {
  const container = querySelectorChain(root, CONTENT_SELECTORS)
  if (!container) return ''

  // 원본 DOM 을 건드리지 않도록 clone 후 가공 — 사이드 이펙트 방지
  const clone = container.cloneNode(true)
  clone.querySelectorAll('script, style, iframe, noscript').forEach(n => n.remove())
  // 이미지는 텍스트 대신 빈 노드로 치환
  clone.querySelectorAll('img').forEach(img => img.remove())

  // 블록 요소 뒤에 \n\n 주입 → textContent 시 문단이 보존됨
  const selector = BLOCK_TAGS_FOR_NEWLINE.join(', ')
  clone.querySelectorAll(selector).forEach(n => {
    try {
      n.insertAdjacentText('afterend', '\n\n')
    } catch (_) {
      // 일부 노드(text node 등)는 insertAdjacentText 미지원 — 무시
    }
  })

  const raw = clone.textContent || ''
  return raw
    .replace(/\r/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+/g, ' ')
    .trim()
}

export function extractImages(root) {
  const imgs = querySelectorAllChain(root, IMAGE_SELECTORS)
  return imgs
    .map(img => ({
      src: img.getAttribute('src') || img.getAttribute('data-src') || img.getAttribute('data-lazy-src') || '',
      alt: img.getAttribute('alt') || '',
      width: toNum(img.getAttribute('width')),
      height: toNum(img.getAttribute('height'))
    }))
    .filter(o => !!o.src)
}

export function extractMeta(root, docForLocation) {
  const tagEls = querySelectorAllChain(root, TAG_SELECTORS)
  const tags = tagEls
    .map(el => textOf(el).replace(/^#/, ''))
    .filter(Boolean)

  const og = (prop) => {
    const el = root.querySelector(`meta[property="${prop}"]`)
    return el ? (el.getAttribute('content') || '') : ''
  }

  const url = (() => {
    if (docForLocation && docForLocation.location) return docForLocation.location.href
    if (typeof location !== 'undefined') return location.href
    return ''
  })()

  return {
    tags,
    ogTitle:       og('og:title'),
    ogDescription: og('og:description'),
    ogUrl:         og('og:url'),
    url
  }
}

// -----------------------------------------------------------------------------
// 통합 진입점
// -----------------------------------------------------------------------------

/**
 * 현재 문서에서 블로그 콘텐츠를 파싱해 반환.
 * 어떤 필드도 추출하지 못하면 빈 값을 포함한 유효한 shape 을 반환한다 (크래시 없음).
 */
export function extract(doc = (typeof document !== 'undefined' ? document : null)) {
  if (!doc) {
    return { title: '', content: '', images: [], meta: emptyMeta() }
  }
  const root = getBlogDocument(doc)
  if (!root) {
    return { title: '', content: '', images: [], meta: emptyMeta() }
  }
  return {
    title:   extractTitle(root),
    content: extractContent(root),
    images:  extractImages(root),
    meta:    extractMeta(root, doc)
  }
}

/**
 * 디버깅/분기용 — 현재 페이지의 에디터 버전을 추정.
 */
export function detectEditorVersion(doc = (typeof document !== 'undefined' ? document : null)) {
  if (!doc) return 'unknown'
  const root = getBlogDocument(doc)
  if (!root) return 'unknown'
  if (root.querySelector('div.se-main-container')) return 'smarteditor-one'
  if (root.querySelector('div#postViewArea'))       return 'legacy'
  if (root.querySelector('div.post_ct'))            return 'post-ct'
  return 'unknown'
}

// -----------------------------------------------------------------------------
// Internal
// -----------------------------------------------------------------------------

function toNum(v) {
  if (v == null) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function emptyMeta() {
  return { tags: [], ogTitle: '', ogDescription: '', ogUrl: '', url: '' }
}
