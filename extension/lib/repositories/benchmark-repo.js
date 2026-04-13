// repositories/benchmark-repo.js
// benchmark_blogs / benchmark_posts 테이블 접근 추상화.
//
// 스키마(_workspace/backend_schema_changelog.md / supabase/migrations/003_benchmarks.sql):
//   benchmark_blogs(id UUID PK, user_id UUID FK profiles, blog_url TEXT, blog_name TEXT, added_at TIMESTAMPTZ)
//     UNIQUE(user_id, blog_url)
//   benchmark_posts(id UUID PK, blog_id UUID FK benchmark_blogs, post_url TEXT UNIQUE,
//                   title TEXT, content_snippet TEXT, metrics JSONB, fetched_at TIMESTAMPTZ)
//
// 원칙:
//   - RLS 가 본인 격리를 강제하므로 user_id 기반 격리 검증은 DB 측 정책에 위임.
//   - 클라이언트는 sanitize 만 수행(길이 제한·HTML 태그 제거 호출자 책임).

import { supabase } from '../supabase-client.js'

const BLOGS_TABLE = 'benchmark_blogs'
const POSTS_TABLE = 'benchmark_posts'

const MAX_BLOG_NAME = 200
const MAX_TITLE = 500
const MAX_SNIPPET = 1500

/**
 * @typedef {Object} BenchmarkBlog
 * @property {string} id
 * @property {string} user_id
 * @property {string} blog_url
 * @property {string | null} blog_name
 * @property {string} added_at
 */

/**
 * @typedef {Object} BenchmarkPostInput
 * @property {string} post_url
 * @property {string} [title]
 * @property {string} [content_snippet]   HTML 태그 제거된 평문(호출자 책임)
 * @property {Object} [metrics]
 */

function assertNonEmpty(value, name) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`benchmark-repo: ${name} 가 비어 있습니다.`)
  }
}

function clampStr(value, max) {
  if (value == null) return null
  return String(value).slice(0, max)
}

/**
 * 본인 즐겨찾기 추가.
 * @param {string} userId
 * @param {string} blogUrl
 * @param {string | null} [blogName]
 * @returns {Promise<BenchmarkBlog>}
 */
export async function addBlog(userId, blogUrl, blogName = null) {
  assertNonEmpty(userId, 'userId')
  assertNonEmpty(blogUrl, 'blogUrl')

  const { data, error } = await supabase
    .from(BLOGS_TABLE)
    .insert({
      user_id: userId,
      blog_url: blogUrl,
      blog_name: clampStr(blogName, MAX_BLOG_NAME),
    })
    .select('id, user_id, blog_url, blog_name, added_at')
    .single()

  if (error) {
    if (error.code === '23505') {
      throw new Error('이미 등록된 블로그입니다.')
    }
    throw new Error(`즐겨찾기 추가 실패: ${error.message}`)
  }
  return /** @type {BenchmarkBlog} */ (data)
}

/**
 * 본인 즐겨찾기 삭제 (RLS 가 다른 사용자 row 차단).
 * @param {string} blogId
 * @returns {Promise<void>}
 */
export async function removeBlog(blogId) {
  assertNonEmpty(blogId, 'blogId')
  const { error } = await supabase.from(BLOGS_TABLE).delete().eq('id', blogId)
  if (error) throw new Error(`즐겨찾기 삭제 실패: ${error.message}`)
}

/**
 * 본인 블로그 목록 (RLS 로 자동 격리). user_id 인자는 가시성 검증용으로 받는다.
 * @param {string} userId
 * @returns {Promise<BenchmarkBlog[]>}
 */
export async function listBlogs(userId) {
  assertNonEmpty(userId, 'userId')
  const { data, error } = await supabase
    .from(BLOGS_TABLE)
    .select('id, user_id, blog_url, blog_name, added_at')
    .eq('user_id', userId)
    .order('added_at', { ascending: false })

  if (error) throw new Error(`블로그 목록 조회 실패: ${error.message}`)
  return /** @type {BenchmarkBlog[]} */ (data ?? [])
}

/**
 * 단일 블로그 조회 (sync 시 권한 확인용).
 * @param {string} blogId
 * @returns {Promise<BenchmarkBlog | null>}
 */
export async function getBlog(blogId) {
  assertNonEmpty(blogId, 'blogId')
  const { data, error } = await supabase
    .from(BLOGS_TABLE)
    .select('id, user_id, blog_url, blog_name, added_at')
    .eq('id', blogId)
    .maybeSingle()

  if (error) throw new Error(`블로그 조회 실패: ${error.message}`)
  return /** @type {BenchmarkBlog | null} */ (data)
}

/**
 * 스케줄러용: 본인 모든 블로그 (alarm 핸들러가 순회).
 * 명시적 sync 권한이 필요하므로 user_id 필터를 강제한다.
 * @param {string} userId
 * @returns {Promise<BenchmarkBlog[]>}
 */
export async function listAllForSync(userId) {
  return listBlogs(userId)
}

/**
 * 수집한 글들을 upsert (post_url 기준).
 * 빈 배열이면 즉시 반환.
 * @param {string} blogId
 * @param {BenchmarkPostInput[]} posts
 * @returns {Promise<{ inserted: number }>}
 */
export async function upsertPosts(blogId, posts) {
  assertNonEmpty(blogId, 'blogId')
  if (!Array.isArray(posts) || posts.length === 0) {
    return { inserted: 0 }
  }

  const rows = posts
    .filter((p) => p && typeof p.post_url === 'string' && p.post_url.trim())
    .map((p) => ({
      blog_id: blogId,
      post_url: p.post_url,
      title: clampStr(p.title ?? null, MAX_TITLE),
      content_snippet: clampStr(p.content_snippet ?? null, MAX_SNIPPET),
      metrics: p.metrics && typeof p.metrics === 'object' ? p.metrics : {},
      fetched_at: new Date().toISOString(),
    }))

  if (rows.length === 0) return { inserted: 0 }

  const { error, count } = await supabase
    .from(POSTS_TABLE)
    .upsert(rows, { onConflict: 'post_url', count: 'exact' })

  if (error) throw new Error(`글 upsert 실패: ${error.message}`)
  return { inserted: count ?? rows.length }
}

/**
 * 특정 블로그의 수집된 글 목록. fetched_at 기준 최신순.
 * @param {string} blogId
 * @param {{ limit?: number }} [opts]
 * @returns {Promise<Array<{ id: string, blog_id: string, post_url: string, title: string|null, content_snippet: string|null, metrics: object, fetched_at: string }>>}
 */
export async function listPosts(blogId, opts = {}) {
  assertNonEmpty(blogId, 'blogId')
  const limit = Number.isFinite(opts.limit) ? Math.max(1, Math.min(200, opts.limit)) : 50

  const { data, error } = await supabase
    .from(POSTS_TABLE)
    .select('id, blog_id, post_url, title, content_snippet, metrics, fetched_at')
    .eq('blog_id', blogId)
    .order('fetched_at', { ascending: false })
    .limit(limit)

  if (error) throw new Error(`벤치마크 글 조회 실패: ${error.message}`)
  return data ?? []
}

/**
 * benchmark_blogs 의 본인 행 변화(INSERT/UPDATE/DELETE)를 Realtime 으로 구독.
 * 호출마다 새 채널을 만들므로 반환된 unsubscribe 를 반드시 호출해야 누수 없다.
 * @param {string} userId
 * @param {(payload: { event: 'INSERT'|'UPDATE'|'DELETE', new: BenchmarkBlog | null, old: BenchmarkBlog | null }) => void} onChange
 * @returns {() => Promise<void>} unsubscribe
 */
export function subscribeToChanges(userId, onChange) {
  assertNonEmpty(userId, 'userId')
  if (typeof onChange !== 'function') {
    throw new Error('benchmark-repo: onChange 콜백이 필요합니다.')
  }

  const channelName = `benchmark_blogs:${userId}:${Date.now()}`
  const channel = supabase
    .channel(channelName)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: BLOGS_TABLE,
        filter: `user_id=eq.${userId}`,
      },
      (payload) => {
        try {
          onChange({
            event: /** @type {'INSERT'|'UPDATE'|'DELETE'} */ (payload.eventType),
            new: /** @type {BenchmarkBlog | null} */ (payload.new ?? null),
            old: /** @type {BenchmarkBlog | null} */ (payload.old ?? null),
          })
        } catch (err) {
          console.warn('[benchmark-repo] onChange 콜백 에러', err?.message)
        }
      }
    )
    .subscribe()

  return async function unsubscribe() {
    try {
      await supabase.removeChannel(channel)
    } catch (err) {
      console.warn('[benchmark-repo] removeChannel 실패', err?.message)
    }
  }
}
