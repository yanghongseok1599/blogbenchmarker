// extension/lib/repositories/usage-repo.js
// usage_logs 테이블 접근. 사용자 본인 쿼리만 RLS 로 허용된다.
// 관련 스키마: _workspace/backend_schema_changelog.md §1.5
//   usage_logs(id UUID, user_id UUID FK profiles, feature TEXT, cost_tokens INT, created_at TIMESTAMPTZ)

import { supabase } from '../supabase-client.js'

const TABLE = 'usage_logs'

/** 30일 윈도우(밀리초). monthly 라 부르지만 달력상 '월'이 아닌 rolling 30일. */
const MONTHLY_WINDOW_MS = 30 * 24 * 60 * 60 * 1000
/** 24시간 윈도우 */
const DAILY_WINDOW_MS = 24 * 60 * 60 * 1000

/**
 * 플랜별 월간 총 사용량 한도.
 * 일일 free quota 3회 × 30일 ≈ 90. app_settings.daily_free_quota 로 런타임 오버라이드 가능(후속).
 * Infinity 는 UI 에서 "무제한" 표기로 치환.
 * @type {Record<'free'|'pro'|'unlimited', number>}
 */
export const MONTHLY_LIMITS = Object.freeze({
  free: 90,
  pro: 500,
  unlimited: Number.POSITIVE_INFINITY,
})

/**
 * 플랜별 일일 한도(쿼터 검증용).
 * @type {Record<'free'|'pro'|'unlimited', number>}
 */
export const DAILY_LIMITS = Object.freeze({
  free: 3,
  pro: 30,
  unlimited: Number.POSITIVE_INFINITY,
})

function assertUserId(userId) {
  if (!userId || typeof userId !== 'string') {
    throw new Error('usage-repo: userId 가 비어 있습니다.')
  }
}

function isoSinceMs(ms) {
  return new Date(Date.now() - ms).toISOString()
}

/**
 * 최근 30일 총 사용 건수.
 * @param {string} userId
 * @returns {Promise<number>}
 */
export async function getMonthlyUsage(userId) {
  assertUserId(userId)
  const { count, error } = await supabase
    .from(TABLE)
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', isoSinceMs(MONTHLY_WINDOW_MS))

  if (error) throw new Error(`월간 사용량 조회 실패: ${error.message}`)
  return count ?? 0
}

/**
 * 최근 24시간 총 사용 건수 (일일 쿼터 검증용).
 * @param {string} userId
 * @returns {Promise<number>}
 */
export async function getDailyUsage(userId) {
  assertUserId(userId)
  const { count, error } = await supabase
    .from(TABLE)
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', isoSinceMs(DAILY_WINDOW_MS))

  if (error) throw new Error(`일일 사용량 조회 실패: ${error.message}`)
  return count ?? 0
}

/**
 * 최근 30일 기능별 사용 건수 breakdown.
 * Supabase REST 에 GROUP BY 표준 지원이 없어 클라이언트 집계(상한 5000건).
 * @param {string} userId
 * @returns {Promise<Array<{ feature: string, count: number, costTokens: number }>>}
 */
export async function getFeatureBreakdown(userId) {
  assertUserId(userId)
  const { data, error } = await supabase
    .from(TABLE)
    .select('feature, cost_tokens, created_at')
    .eq('user_id', userId)
    .gte('created_at', isoSinceMs(MONTHLY_WINDOW_MS))
    .order('created_at', { ascending: false })
    .limit(5000)

  if (error) throw new Error(`기능별 사용량 조회 실패: ${error.message}`)

  const byFeature = new Map()
  for (const row of data || []) {
    const key = String(row?.feature ?? 'unknown')
    const prev = byFeature.get(key) || { feature: key, count: 0, costTokens: 0 }
    prev.count += 1
    prev.costTokens += Number(row?.cost_tokens) || 0
    byFeature.set(key, prev)
  }
  const out = Array.from(byFeature.values())
  out.sort((a, b) => b.count - a.count)
  return out
}

/**
 * 플랜 한도 대비 월간 사용 비율. 0~100 사이 정수. 무제한 플랜은 0 반환.
 * @param {number} usage
 * @param {'free'|'pro'|'unlimited'} plan
 * @returns {{ limit: number, usage: number, percent: number, isUnlimited: boolean }}
 */
export function computeMonthlyRatio(usage, plan) {
  const limit = MONTHLY_LIMITS[plan] ?? MONTHLY_LIMITS.free
  const isUnlimited = !Number.isFinite(limit)
  if (isUnlimited) {
    return { limit: Number.POSITIVE_INFINITY, usage, percent: 0, isUnlimited: true }
  }
  const percent = limit > 0 ? Math.min(100, Math.round((usage / limit) * 100)) : 0
  return { limit, usage, percent, isUnlimited: false }
}
