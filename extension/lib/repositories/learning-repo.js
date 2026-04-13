// repositories/learning-repo.js
// learning_data 테이블 접근 추상화.
//
// 스키마(supabase/migrations/002_learning_data.sql):
//   learning_data(id UUID PK, user_id UUID FK profiles, content_json JSONB,
//                 keywords TEXT[], meta JSONB, created_at TIMESTAMPTZ)
//
// 원칙:
//   - RLS 가 본인 격리를 강제 — 클라이언트는 sanitize 만 수행.
//   - **저작권 안전:** 타인 블로그 수집 데이터(benchmark_posts)는 본 테이블에 들어가면 안 된다.
//     호출자가 ownContent 플래그를 명시적으로 전달했을 때만 저장하는 게이트는 호출자(handler) 책임.

import { supabase } from '../supabase-client.js'

const TABLE = 'learning_data'

const MAX_TITLE = 500
const MAX_CONTENT = 30_000     // 글 본문 최대 30KB
const MAX_KEYWORDS = 50
const MAX_KEYWORD_LEN = 50

/**
 * @typedef {Object} LearningRecord
 * @property {string} id
 * @property {string} user_id
 * @property {{ title: string, content: string }} content_json
 * @property {string[]} keywords
 * @property {Object} meta
 * @property {string} created_at
 */

function assertNonEmpty(value, name) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`learning-repo: ${name} 가 비어 있습니다.`)
  }
}

function clampStr(value, max) {
  return value == null ? '' : String(value).slice(0, max)
}

/**
 * 키워드 배열을 정규화(중복 제거 + 길이 제한).
 * @param {unknown} input
 * @returns {string[]}
 */
function sanitizeKeywords(input) {
  if (!Array.isArray(input)) return []
  const seen = new Set()
  const out = []
  for (const raw of input) {
    if (typeof raw !== 'string') continue
    const trimmed = raw.trim().slice(0, MAX_KEYWORD_LEN)
    if (!trimmed) continue
    if (seen.has(trimmed)) continue
    seen.add(trimmed)
    out.push(trimmed)
    if (out.length >= MAX_KEYWORDS) break
  }
  return out
}

function sanitizeMeta(meta) {
  if (!meta || typeof meta !== 'object') return {}
  // 직렬화 안전성 확보 — 함수/순환참조 제거
  try {
    return JSON.parse(JSON.stringify(meta))
  } catch {
    return {}
  }
}

/**
 * 학습 데이터 1건 저장.
 * @param {string} userId
 * @param {{ title: string, content: string, keywords?: string[], meta?: Object }} input
 * @returns {Promise<LearningRecord>}
 */
export async function saveLearning(userId, input) {
  assertNonEmpty(userId, 'userId')
  if (!input || typeof input !== 'object') {
    throw new Error('learning-repo: input 이 필요합니다.')
  }
  const title = clampStr(input.title, MAX_TITLE).trim()
  const content = clampStr(input.content, MAX_CONTENT).trim()
  if (!title && !content) {
    throw new Error('learning-repo: title/content 중 최소 하나는 필요합니다.')
  }

  const row = {
    user_id: userId,
    content_json: { title, content },
    keywords: sanitizeKeywords(input.keywords),
    meta: sanitizeMeta(input.meta),
  }

  const { data, error } = await supabase
    .from(TABLE)
    .insert(row)
    .select('id, user_id, content_json, keywords, meta, created_at')
    .single()

  if (error) throw new Error(`학습 데이터 저장 실패: ${error.message}`)
  return /** @type {LearningRecord} */ (data)
}

/**
 * 본인 학습 데이터 목록 (최신순).
 * @param {string} userId
 * @param {{ limit?: number, offset?: number }} [opts]
 * @returns {Promise<LearningRecord[]>}
 */
export async function listLearnings(userId, opts = {}) {
  assertNonEmpty(userId, 'userId')
  const limit = clampLimit(opts.limit, 50, 200)
  const offset = Math.max(0, Number(opts.offset) || 0)

  const { data, error } = await supabase
    .from(TABLE)
    .select('id, user_id, content_json, keywords, meta, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) throw new Error(`학습 데이터 조회 실패: ${error.message}`)
  return /** @type {LearningRecord[]} */ (data ?? [])
}

/**
 * 단일 조회 — generate-handler 가 선택된 학습본을 가져갈 때 사용.
 * @param {string} userId
 * @param {string[]} ids
 * @returns {Promise<LearningRecord[]>}
 */
export async function getLearningsByIds(userId, ids) {
  assertNonEmpty(userId, 'userId')
  if (!Array.isArray(ids) || ids.length === 0) return []
  const trimmed = ids.filter((v) => typeof v === 'string' && v).slice(0, 20)
  if (trimmed.length === 0) return []

  const { data, error } = await supabase
    .from(TABLE)
    .select('id, user_id, content_json, keywords, meta, created_at')
    .eq('user_id', userId)
    .in('id', trimmed)

  if (error) throw new Error(`학습 데이터 조회 실패: ${error.message}`)
  return /** @type {LearningRecord[]} */ (data ?? [])
}

/**
 * 본인 학습 데이터 삭제.
 * @param {string} id
 * @returns {Promise<void>}
 */
export async function deleteLearning(id) {
  assertNonEmpty(id, 'id')
  const { error } = await supabase.from(TABLE).delete().eq('id', id)
  if (error) throw new Error(`학습 데이터 삭제 실패: ${error.message}`)
}

/**
 * 키워드 배열로 검색 (overlap = 하나라도 매치).
 * GIN 인덱스(idx_learning_data_keywords)가 사용된다.
 * @param {string} userId
 * @param {string[]} keywords
 * @param {{ limit?: number }} [opts]
 * @returns {Promise<LearningRecord[]>}
 */
export async function searchByKeywords(userId, keywords, opts = {}) {
  assertNonEmpty(userId, 'userId')
  const list = sanitizeKeywords(keywords)
  if (list.length === 0) return []

  const limit = clampLimit(opts.limit, 30, 200)
  const { data, error } = await supabase
    .from(TABLE)
    .select('id, user_id, content_json, keywords, meta, created_at')
    .eq('user_id', userId)
    .overlaps('keywords', list)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw new Error(`학습 데이터 검색 실패: ${error.message}`)
  return /** @type {LearningRecord[]} */ (data ?? [])
}

/**
 * 본인 학습 데이터 개수 (제한 검증·UI 카운트용).
 * @param {string} userId
 * @returns {Promise<number>}
 */
export async function countLearnings(userId) {
  assertNonEmpty(userId, 'userId')
  const { count, error } = await supabase
    .from(TABLE)
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)

  if (error) throw new Error(`학습 데이터 카운트 실패: ${error.message}`)
  return count ?? 0
}

function clampLimit(raw, fallback, max) {
  const n = Number(raw)
  if (!Number.isFinite(n) || n <= 0) return fallback
  return Math.min(Math.floor(n), max)
}
