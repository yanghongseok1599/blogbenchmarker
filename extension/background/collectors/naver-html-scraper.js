// background/collectors/naver-html-scraper.js
// RSS 가 막혔거나 빈 응답일 때 사용하는 폴백 — 네이버 블로그 PostList 페이지를 HTML 로 가져와 글 목록 추출.
//
// host_permissions(blog.naver.com 3종) 안에서만 동작.
// HTML 파싱: DOMParser('text/html'). DOMParser 는 스크립트를 실행하지 않으므로 안전.
// 본문 스니펫: HTML 태그 제거 후 평문만 저장 (DB content_snippet).

import { stripHtml, extractBlogId } from './naver-rss-collector.js'

const ALLOWED_HOSTS = new Set(['blog.naver.com', 'm.blog.naver.com'])

/**
 * @typedef {import('./naver-rss-collector.js').CollectedPost} CollectedPost
 */

/**
 * 모바일 PostList URL 생성. PC 버전보다 마크업이 단순해 셀렉터 안정성이 높다.
 * @param {string} blogId
 * @returns {string}
 */
export function postListUrlOf(blogId) {
  if (!/^[A-Za-z0-9_-]{1,40}$/.test(blogId)) {
    throw new Error(`naver-html: 잘못된 blogId: ${blogId}`)
  }
  return `https://m.blog.naver.com/${blogId}`
}

/**
 * 블로그 메인 페이지를 fetch 하고 최근 글 목록을 추출한다.
 * @param {string} blogId
 * @param {{ limit?: number, signal?: AbortSignal }} [opts]
 * @returns {Promise<CollectedPost[]>}
 */
export async function collectFromHtml(blogId, opts = {}) {
  const limit = Math.min(Math.max(1, Number(opts.limit) || 10), 50)
  const url = postListUrlOf(blogId)

  const target = new URL(url)
  if (!ALLOWED_HOSTS.has(target.hostname)) {
    throw new Error(`naver-html: 허용되지 않은 호스트: ${target.hostname}`)
  }

  const res = await fetch(url, {
    method: 'GET',
    credentials: 'omit',
    redirect: 'follow',
    signal: opts.signal,
    headers: { Accept: 'text/html,application/xhtml+xml' },
  })

  if (!res.ok) {
    throw new Error(`naver-html: HTTP ${res.status} (${blogId})`)
  }

  const html = await res.text()
  return parsePostListHtml(html, blogId, limit)
}

/**
 * HTML 텍스트에서 글 목록 추출.
 * @param {string} html
 * @param {string} blogId
 * @param {number} limit
 * @returns {CollectedPost[]}
 */
export function parsePostListHtml(html, blogId, limit = 10) {
  if (typeof DOMParser === 'undefined') {
    throw new Error('naver-html: DOMParser 미지원 환경')
  }
  if (!html || html.length < 50) {
    throw new Error('naver-html: 빈 HTML')
  }

  const parser = new DOMParser()
  const doc = parser.parseFromString(html, 'text/html')

  // 후보 셀렉터 우선순위:
  //   1) PC 메인: a[href*="/PostView."], a[href*="logNo="]
  //   2) 모바일:  a.link__item, li a[href]
  // 각 후보에서 글 URL/제목 추출 후 중복 제거.
  const seen = new Set()
  /** @type {CollectedPost[]} */
  const posts = []

  const anchors = Array.from(doc.querySelectorAll('a[href]'))
  for (const a of anchors) {
    if (posts.length >= limit) break
    const href = a.getAttribute('href') || ''
    const absUrl = toAbsoluteNaverUrl(href, blogId)
    if (!absUrl) continue
    if (!isNaverPostUrl(absUrl)) continue
    if (seen.has(absUrl)) continue
    seen.add(absUrl)

    const title = (a.textContent || '').trim().slice(0, 500)
    if (!title) continue

    posts.push({
      post_url: absUrl,
      title,
      published_at: null, // HTML 폴백 경로에서는 정확한 게시일 추출 어려움 — null 안전 반환
      content_snippet: stripHtml(title).slice(0, 1500) || null,
    })
  }

  return posts
}

/**
 * 상대/절대 href 를 m.blog.naver.com 절대 URL 로 정규화한다.
 * - 외부 도메인 / javascript:* / # 등은 null.
 * - 현 블로그 외 글은 일단 통과시키되, 이후 isNaverPostUrl 가 한 번 더 검사한다.
 * @param {string} href
 * @param {string} blogId
 * @returns {string | null}
 */
function toAbsoluteNaverUrl(href, blogId) {
  if (!href || typeof href !== 'string') return null
  if (href.startsWith('javascript:')) return null
  if (href.startsWith('#')) return null

  try {
    const base = `https://m.blog.naver.com/${blogId}/`
    const u = new URL(href, base)
    if (u.protocol !== 'https:') return null
    if (!ALLOWED_HOSTS.has(u.hostname)) return null
    // 글 URL 패턴: /{blogId}/{logNo} 또는 PostView.naver?logNo=...
    const looksLikePost =
      /^\/[A-Za-z0-9_-]{1,40}\/\d+/.test(u.pathname) ||
      /\/PostView\./.test(u.pathname) ||
      u.searchParams.has('logNo')
    if (!looksLikePost) return null
    return u.toString()
  } catch {
    return null
  }
}

function isNaverPostUrl(url) {
  try {
    const u = new URL(url)
    if (u.protocol !== 'https:') return false
    return ALLOWED_HOSTS.has(u.hostname) || u.hostname.endsWith('.blog.naver.com')
  } catch {
    return false
  }
}

// 진단용 export — 핸들러가 blogUrl → blogId 변환을 양 collector 에서 일관되게 쓰도록.
export { extractBlogId }
