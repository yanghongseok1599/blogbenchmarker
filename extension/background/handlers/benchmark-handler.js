// background/handlers/benchmark-handler.js
// Phase 4.2: 벤치마킹 즐겨찾기 + 자동 글 수집 핸들러.
//
// 액션:
//   benchmark.addBlog        — 즐겨찾기 추가
//   benchmark.removeBlog     — 즐겨찾기 삭제
//   benchmark.listBlogs      — 본인 블로그 목록
//   benchmark.syncBlogPosts  — 단일 블로그 또는 전체 동기화 (스케줄러도 호출)
//
// 레이트 리밋: 블로그당 최소 10분 간격(MIN_SYNC_INTERVAL_MS).
// 1회 sync 최대 10개 글(POSTS_PER_SYNC).
//
// 안전 규칙:
//   - fetch 는 host_permissions 도메인(blog.naver.com 3종) 안에서만.
//   - content_snippet 은 collector 에서 HTML 태그 제거(stripHtml) 후 저장.
//   - chrome.storage.local 캐시는 last-sync 타임스탬프 추적용 (DB 컬럼 추가 회피).

import * as repo from '../../lib/repositories/benchmark-repo.js'
import { collectFromRss, extractBlogId } from '../collectors/naver-rss-collector.js'
import { collectFromHtml } from '../collectors/naver-html-scraper.js'

const POSTS_PER_SYNC = 10
const MIN_SYNC_INTERVAL_MS = 10 * 60 * 1000 // 10분
const FETCH_TIMEOUT_MS = 15_000
const SYNC_LOCK_KEY = '__bm_sync_locks'
const LAST_SYNC_KEY_PREFIX = 'bm_last_sync_'

/**
 * @typedef {import('../../lib/repositories/benchmark-repo.js').BenchmarkBlog} BenchmarkBlog
 */

// ─────────────────────────────────────────────────────────────
// 공개 핸들러
// ─────────────────────────────────────────────────────────────

export const benchmarkHandler = {
  /**
   * 즐겨찾기 추가.
   * @param {{ blogUrl: string, blogName?: string, userId: string }} payload
   */
  async addBlog(payload) {
    const { blogUrl, blogName = null, userId } = payload || {}
    assertNonEmpty(userId, 'userId')
    assertNonEmpty(blogUrl, 'blogUrl')

    const blogId = extractBlogId(blogUrl)
    if (!blogId) {
      throw new Error('네이버 블로그 URL 이 아닙니다.')
    }

    const row = await repo.addBlog(userId, blogUrl, blogName)
    return { blog: row, naverBlogId: blogId }
  },

  /**
   * 즐겨찾기 삭제.
   * @param {{ blogId: string }} payload
   */
  async removeBlog(payload) {
    const { blogId } = payload || {}
    assertNonEmpty(blogId, 'blogId')
    await repo.removeBlog(blogId)
    // 삭제된 블로그의 last-sync 캐시도 정리
    await chrome.storage.local.remove(LAST_SYNC_KEY_PREFIX + blogId)
    return { ok: true }
  },

  /**
   * 본인 즐겨찾기 목록.
   * @param {{ userId: string }} payload
   */
  async listBlogs(payload) {
    const { userId } = payload || {}
    assertNonEmpty(userId, 'userId')
    const blogs = await repo.listBlogs(userId)
    return { blogs }
  },

  /**
   * 동기화: blogId 지정 시 단일, 미지정 시 본인 전체.
   * @param {{ userId: string, blogId?: string, force?: boolean }} payload
   */
  async syncBlogPosts(payload) {
    const { userId, blogId = null, force = false } = payload || {}
    assertNonEmpty(userId, 'userId')

    let targets
    if (blogId) {
      const row = await repo.getBlog(blogId)
      if (!row || row.user_id !== userId) {
        throw new Error('블로그를 찾을 수 없거나 권한이 없습니다.')
      }
      targets = [row]
    } else {
      targets = await repo.listAllForSync(userId)
    }

    /** @type {Array<{ blogId: string, status: 'ok' | 'skipped' | 'error', inserted?: number, error?: string }>} */
    const results = []
    for (const blog of targets) {
      try {
        const r = await syncSingleBlog(blog, { force })
        results.push({ blogId: blog.id, ...r })
      } catch (e) {
        results.push({ blogId: blog.id, status: 'error', error: e?.message ?? String(e) })
      }
    }
    return { count: targets.length, results }
  },
}

// ─────────────────────────────────────────────────────────────
// 내부 동기화 로직
// ─────────────────────────────────────────────────────────────

/**
 * 단일 블로그 동기화. 레이트 리밋 + 동시 실행 락 + RSS 우선 / HTML 폴백.
 * @param {BenchmarkBlog} blog
 * @param {{ force?: boolean }} opts
 */
async function syncSingleBlog(blog, { force = false } = {}) {
  // 1) 레이트 리밋 — 마지막 동기화로부터 MIN_SYNC_INTERVAL_MS 미만이면 skip
  if (!force && (await isRateLimited(blog.id))) {
    return { status: /** @type {const} */ ('skipped') }
  }

  // 2) 동시 실행 락 — 같은 blogId 가 alarm + 수동 sync 동시 진입 방지
  if (!(await acquireLock(blog.id))) {
    return { status: /** @type {const} */ ('skipped') }
  }

  try {
    // 3) blogId 추출 (저장된 blog_url 에서)
    const naverBlogId = extractBlogId(blog.blog_url)
    if (!naverBlogId) {
      throw new Error('blog_url 에서 blogId 를 추출할 수 없습니다.')
    }

    // 4) RSS 시도, 실패/빈결과 시 HTML 폴백
    const posts = await collectWithFallback(naverBlogId)

    // 5) DB upsert (post_url unique 충돌은 자동 무시)
    const trimmed = posts.slice(0, POSTS_PER_SYNC)
    const { inserted } = await repo.upsertPosts(blog.id, trimmed)

    // 6) 마지막 동기화 시점 기록
    await markSynced(blog.id)
    return { status: /** @type {const} */ ('ok'), inserted }
  } finally {
    await releaseLock(blog.id)
  }
}

/**
 * RSS → HTML 폴백 흐름. 양쪽 모두 timeout 가드.
 * @param {string} naverBlogId
 */
async function collectWithFallback(naverBlogId) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS)

  try {
    const rssPosts = await safeCollect(() =>
      collectFromRss(naverBlogId, { limit: POSTS_PER_SYNC, signal: ctrl.signal }),
    )
    if (rssPosts && rssPosts.length > 0) return rssPosts

    const htmlPosts = await safeCollect(() =>
      collectFromHtml(naverBlogId, { limit: POSTS_PER_SYNC, signal: ctrl.signal }),
    )
    return htmlPosts ?? []
  } finally {
    clearTimeout(timer)
  }
}

async function safeCollect(fn) {
  try {
    return await fn()
  } catch (e) {
    console.warn('[benchmark-handler] collector 실패:', e?.message)
    return null
  }
}

// ─────────────────────────────────────────────────────────────
// 레이트 리밋 + 락 (chrome.storage.local 사용)
// ─────────────────────────────────────────────────────────────

async function isRateLimited(blogId) {
  const key = LAST_SYNC_KEY_PREFIX + blogId
  const obj = await chrome.storage.local.get(key)
  const last = Number(obj?.[key] ?? 0)
  if (!last) return false
  return Date.now() - last < MIN_SYNC_INTERVAL_MS
}

async function markSynced(blogId) {
  const key = LAST_SYNC_KEY_PREFIX + blogId
  await chrome.storage.local.set({ [key]: Date.now() })
}

async function acquireLock(blogId) {
  const obj = await chrome.storage.local.get(SYNC_LOCK_KEY)
  const locks = obj?.[SYNC_LOCK_KEY] || {}
  const now = Date.now()
  // 기존 락이 5분 이상이면 좀비 락으로 간주하고 강제 해제
  if (locks[blogId] && now - Number(locks[blogId]) < 5 * 60 * 1000) {
    return false
  }
  locks[blogId] = now
  await chrome.storage.local.set({ [SYNC_LOCK_KEY]: locks })
  return true
}

async function releaseLock(blogId) {
  const obj = await chrome.storage.local.get(SYNC_LOCK_KEY)
  const locks = obj?.[SYNC_LOCK_KEY] || {}
  delete locks[blogId]
  await chrome.storage.local.set({ [SYNC_LOCK_KEY]: locks })
}

// ─────────────────────────────────────────────────────────────
// 유틸
// ─────────────────────────────────────────────────────────────

function assertNonEmpty(v, name) {
  if (typeof v !== 'string' || v.trim() === '') {
    throw new Error(`benchmark-handler: ${name} 가 비어 있습니다.`)
  }
}
