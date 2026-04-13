// background/collectors/naver-rss-collector.js
// 네이버 블로그 RSS 피드 수집기.
//
// URL 규칙: https://blog.naver.com/rss/{blogId}
//   - host_permissions(blog.naver.com 3종) 안에서만 동작.
//   - 다른 도메인 호출이 들어오면 throw — 권한 외부 호출 차단.
//
// XML 파싱: 외부 라이브러리(fast-xml-parser 등) 금지. DOMParser('text/xml') 만 사용.
//   - text/xml 파싱 실패 시 parsererror 노드를 검사해 즉시 에러 throw.
//   - DOMParser 는 스크립트 태그를 실행하지 않으므로 XML/HTML XSS 위험 없음.
//
// 본문 스니펫: HTML 태그 전부 제거 후 평문만 저장 (DB 컬럼 content_snippet).

const ALLOWED_HOSTS = new Set(['blog.naver.com', 'm.blog.naver.com', 'rss.blog.naver.com'])

/**
 * @typedef {Object} CollectedPost
 * @property {string} post_url
 * @property {string} title
 * @property {string | null} published_at  ISO8601 또는 null
 * @property {string | null} content_snippet  평문(HTML 제거)
 */

/**
 * blogId → RSS URL.
 * @param {string} blogId
 * @returns {string}
 */
export function rssUrlOf(blogId) {
  if (typeof blogId !== 'string' || !/^[A-Za-z0-9_-]{1,40}$/.test(blogId)) {
    throw new Error(`naver-rss: 잘못된 blogId: ${blogId}`)
  }
  return `https://blog.naver.com/rss/${blogId}`
}

/**
 * 네이버 블로그 URL 에서 blogId 를 추출한다.
 * 지원 패턴:
 *   - https://blog.naver.com/{id}
 *   - https://blog.naver.com/{id}/{postNo}
 *   - https://m.blog.naver.com/{id}
 *   - https://blog.naver.com/PostList.naver?blogId={id}
 * @param {string} url
 * @returns {string | null}
 */
export function extractBlogId(url) {
  try {
    const u = new URL(url)
    if (u.protocol !== 'https:') return null
    if (!ALLOWED_HOSTS.has(u.hostname)) return null

    const qpId = u.searchParams.get('blogId')
    if (qpId && /^[A-Za-z0-9_-]{1,40}$/.test(qpId)) return qpId

    const seg = u.pathname.split('/').filter(Boolean)
    if (seg.length === 0) return null
    const candidate = seg[0] === 'rss' ? seg[1] : seg[0]
    if (candidate && /^[A-Za-z0-9_-]{1,40}$/.test(candidate)) return candidate

    return null
  } catch {
    return null
  }
}

/**
 * RSS 피드를 fetch 후 파싱해 글 목록을 반환한다.
 * @param {string} blogId
 * @param {{ limit?: number, signal?: AbortSignal }} [opts]
 * @returns {Promise<CollectedPost[]>}
 */
export async function collectFromRss(blogId, opts = {}) {
  const limit = Math.min(Math.max(1, Number(opts.limit) || 10), 50)
  const url = rssUrlOf(blogId)

  // host_permissions 도메인 한정 보증
  const target = new URL(url)
  if (!ALLOWED_HOSTS.has(target.hostname)) {
    throw new Error(`naver-rss: 허용되지 않은 호스트: ${target.hostname}`)
  }

  const res = await fetch(url, {
    method: 'GET',
    credentials: 'omit',
    redirect: 'follow',
    signal: opts.signal,
    headers: { Accept: 'application/rss+xml, application/xml, text/xml' },
  })

  if (!res.ok) {
    throw new Error(`naver-rss: HTTP ${res.status} (${blogId})`)
  }

  const xmlText = await res.text()
  return parseRssXml(xmlText, limit)
}

/**
 * RSS XML 문자열을 파싱한다. DOMParser('text/xml') + parsererror 검사.
 * @param {string} xmlText
 * @param {number} limit
 * @returns {CollectedPost[]}
 */
export function parseRssXml(xmlText, limit = 10) {
  if (typeof DOMParser === 'undefined') {
    throw new Error('naver-rss: DOMParser 미지원 환경')
  }
  if (!xmlText || xmlText.length < 20) {
    throw new Error('naver-rss: 빈 XML')
  }

  const parser = new DOMParser()
  const doc = parser.parseFromString(xmlText, 'text/xml')

  // text/xml 파싱 실패 시 parsererror 노드가 들어온다 (Chromium 동작)
  const parserError = doc.getElementsByTagName('parsererror')
  if (parserError.length > 0) {
    throw new Error('naver-rss: XML 파싱 실패 (application/xml 변환 필요할 수 있음)')
  }

  const items = Array.from(doc.getElementsByTagName('item')).slice(0, limit)
  /** @type {CollectedPost[]} */
  const posts = []

  for (const item of items) {
    const link = textOfFirst(item, 'link')
    if (!link || !isNaverPostUrl(link)) continue

    const title = textOfFirst(item, 'title') || '(제목 없음)'
    const pub = textOfFirst(item, 'pubDate')
    const description = textOfFirst(item, 'description')

    posts.push({
      post_url: link,
      title: title.trim().slice(0, 500),
      published_at: pub ? toIsoDate(pub) : null,
      content_snippet: stripHtml(description).slice(0, 1500) || null,
    })
  }
  return posts
}

/**
 * 첫 매칭 자식 엘리먼트의 textContent 반환.
 * @param {Element} parent
 * @param {string} tag
 */
function textOfFirst(parent, tag) {
  const el = parent.getElementsByTagName(tag)[0]
  return el?.textContent?.trim() ?? ''
}

/**
 * HTML 태그·엔티티를 모두 제거한 평문을 반환한다.
 * 정규식 기반 — DOM 에 삽입하지 않으므로 안전(어디에도 innerHTML 사용 안 함).
 * @param {string} input
 * @returns {string}
 */
export function stripHtml(input) {
  if (!input) return ''
  return String(input)
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * 네이버 블로그 글 URL 인지 검증.
 * @param {string} url
 */
function isNaverPostUrl(url) {
  try {
    const u = new URL(url)
    if (u.protocol !== 'https:') return false
    return ALLOWED_HOSTS.has(u.hostname)
  } catch {
    return false
  }
}

/**
 * RSS pubDate (RFC 822 등) → ISO8601 변환. 실패 시 null.
 * @param {string} raw
 */
function toIsoDate(raw) {
  const t = Date.parse(raw)
  if (Number.isNaN(t)) return null
  return new Date(t).toISOString()
}
