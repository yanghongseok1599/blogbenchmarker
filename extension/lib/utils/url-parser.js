// lib/utils/url-parser.js
// 네이버 블로그 URL 검증 + blogId/postId 추출 유틸.
//
// 지원 포맷:
//   1) https://blog.naver.com/{blogId}                                  (홈)
//   2) https://blog.naver.com/{blogId}/{postId}                         (글)
//   3) https://blog.naver.com/PostView.naver?blogId={blogId}&logNo={postId}
//   4) https://m.blog.naver.com/{blogId}                                (모바일 홈)
//   5) https://m.blog.naver.com/{blogId}/{postId}                       (모바일 글)
//   6) https://m.blog.naver.com/PostView.naver?blogId=...&logNo=...
//
// 반환 규약:
//   성공 → { isValid: true, blogId, postId | null, canonicalUrl }
//   실패 → { isValid: false, blogId: null, postId: null, canonicalUrl: null }
// canonicalUrl 은 즐겨찾기 저장용으로 **홈 주소** 를 권장하므로 blogId 기준의
// `https://blog.naver.com/{blogId}` 를 반환한다.

const NAVER_BLOG_HOST_RE = /^(?:m\.)?(?:[a-z0-9-]+\.)?blog\.naver\.com$/i

/** 네이버 블로그 ID 허용 문자: 영문/숫자/언더스코어/하이픈 (실제 네이버 규칙보다 살짝 너그럽게) */
const BLOG_ID_RE = /^[A-Za-z0-9_-]{1,30}$/

/** 글 번호(logNo/postId): 숫자만 */
const POST_ID_RE = /^\d{1,20}$/

/** PostView.naver 경로의 예약 식별자 — blogId 로 오인되지 않도록 */
const RESERVED_FIRST_SEGMENTS = new Set([
  'PostView.naver',
  'PostList.naver',
  'postview.nhn',
  'postlist.nhn',
  'prologue',
])

/**
 * @typedef {Object} ParsedBlogUrl
 * @property {boolean} isValid
 * @property {string | null} blogId
 * @property {string | null} postId   (글 URL 이 아니면 null)
 * @property {string | null} canonicalUrl  (`https://blog.naver.com/{blogId}`)
 */

/**
 * URL 문자열을 파싱해 URL 객체로 변환. 실패 시 null.
 * @param {string} raw
 * @returns {URL | null}
 */
function safeParseUrl(raw) {
  if (!raw || typeof raw !== 'string') return null
  const trimmed = raw.trim()
  if (!trimmed) return null
  try {
    return new URL(trimmed)
  } catch {
    // 프로토콜 누락 시 한 번 보정 시도 (blog.naver.com/foo 처럼 붙여넣는 UX 케이스)
    try {
      return new URL(`https://${trimmed}`)
    } catch {
      return null
    }
  }
}

/**
 * 호스트가 네이버 블로그 도메인인지 검사한다.
 * @param {string} rawUrl
 * @returns {boolean}
 */
export function isNaverBlogUrl(rawUrl) {
  const u = safeParseUrl(rawUrl)
  if (!u) return false
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return false
  return NAVER_BLOG_HOST_RE.test(u.hostname)
}

/**
 * 네이버 블로그 URL 을 파싱해 {blogId, postId, canonicalUrl} 을 반환한다.
 * @param {string} rawUrl
 * @returns {ParsedBlogUrl}
 */
export function parseNaverBlogUrl(rawUrl) {
  const fail = () => ({ isValid: false, blogId: null, postId: null, canonicalUrl: null })

  const u = safeParseUrl(rawUrl)
  if (!u || !NAVER_BLOG_HOST_RE.test(u.hostname)) return fail()

  // PostView.naver?blogId=...&logNo=...
  const qBlogId = u.searchParams.get('blogId')
  const qLogNo = u.searchParams.get('logNo')
  if (qBlogId && BLOG_ID_RE.test(qBlogId)) {
    const postId = qLogNo && POST_ID_RE.test(qLogNo) ? qLogNo : null
    return {
      isValid: true,
      blogId: qBlogId,
      postId,
      canonicalUrl: `https://blog.naver.com/${qBlogId}`,
    }
  }

  // path 기반: /{blogId} 또는 /{blogId}/{postId}
  const segments = u.pathname.split('/').filter(Boolean)
  if (segments.length === 0) return fail()

  const first = segments[0]
  if (RESERVED_FIRST_SEGMENTS.has(first)) return fail()
  if (!BLOG_ID_RE.test(first)) return fail()

  const postId = segments[1] && POST_ID_RE.test(segments[1]) ? segments[1] : null

  return {
    isValid: true,
    blogId: first,
    postId,
    canonicalUrl: `https://blog.naver.com/${first}`,
  }
}

/**
 * 입력 URL 을 즐겨찾기 저장용 **홈 URL** 로 정규화한다.
 * 유효하지 않으면 null.
 * @param {string} rawUrl
 * @returns {string | null}
 */
export function normalizeBlogHomeUrl(rawUrl) {
  const parsed = parseNaverBlogUrl(rawUrl)
  return parsed.isValid ? parsed.canonicalUrl : null
}
