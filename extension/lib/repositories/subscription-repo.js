// extension/lib/repositories/subscription-repo.js
// subscriptions 테이블 조회. 쓰기는 Edge Function(verify-subscription) service_role 전용.
// 관련 스키마: _workspace/backend_schema_changelog.md §1.7
//   subscriptions(id, user_id, plan, status, starts_at, ends_at, gateway, payment_id, created_at)
//   status ∈ { active, cancelled, expired, refunded }

import { supabase } from '../supabase-client.js'

const TABLE = 'subscriptions'

const MS_PER_DAY = 24 * 60 * 60 * 1000

function assertUserId(userId) {
  if (!userId || typeof userId !== 'string') {
    throw new Error('subscription-repo: userId 가 비어 있습니다.')
  }
}

/**
 * @typedef {Object} Subscription
 * @property {string} id
 * @property {'free'|'pro'|'unlimited'} plan
 * @property {'active'|'cancelled'|'expired'|'refunded'} status
 * @property {string} starts_at
 * @property {string | null} ends_at
 * @property {'toss'|'portone'|null} gateway
 * @property {string | null} payment_id
 * @property {string} created_at
 */

/**
 * 현재 활성 구독 1건을 반환한다(없으면 null = free 플랜).
 *   - status = 'active' 또는 'cancelled' (해지 예약이지만 ends_at 까지는 혜택 유지)
 *   - ends_at IS NULL OR ends_at > NOW()
 * 가장 최근 starts_at 기준 1건.
 * @param {string} userId
 * @returns {Promise<Subscription | null>}
 */
export async function getActivePlan(userId) {
  assertUserId(userId)
  const nowIso = new Date().toISOString()

  const { data, error } = await supabase
    .from(TABLE)
    .select('id, plan, status, starts_at, ends_at, gateway, payment_id, created_at')
    .eq('user_id', userId)
    .in('status', ['active', 'cancelled'])
    .or(`ends_at.is.null,ends_at.gt.${nowIso}`)
    .order('starts_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw new Error(`활성 구독 조회 실패: ${error.message}`)
  return /** @type {Subscription | null} */ (data)
}

/**
 * @typedef {Object} ExpiryInfo
 * @property {string | null} endsAt         ISO8601 또는 null(무기한)
 * @property {number | null} daysUntilExpiry  남은 일수(올림). 무기한이면 null
 * @property {boolean} isExpired            이미 만료됨
 * @property {boolean} willExpireSoon       3일 이내 만료
 * @property {boolean} willExpireVerySoon   1일 이내 만료
 * @property {'active'|'cancelled'|'expired'|'refunded'|null} status
 * @property {'free'|'pro'|'unlimited'} plan
 */

/**
 * 현재 구독의 만료 정보.
 * free 플랜 사용자(active subscription 없음)는 endsAt=null, willExpireSoon=false 반환.
 * @param {string} userId
 * @returns {Promise<ExpiryInfo>}
 */
export async function getExpiryInfo(userId) {
  assertUserId(userId)
  const sub = await getActivePlan(userId)

  if (!sub) {
    return {
      endsAt: null,
      daysUntilExpiry: null,
      isExpired: false,
      willExpireSoon: false,
      willExpireVerySoon: false,
      status: null,
      plan: 'free',
    }
  }

  if (!sub.ends_at) {
    return {
      endsAt: null,
      daysUntilExpiry: null,
      isExpired: false,
      willExpireSoon: false,
      willExpireVerySoon: false,
      status: sub.status,
      plan: sub.plan,
    }
  }

  const endsAtMs = new Date(sub.ends_at).getTime()
  const diffMs = endsAtMs - Date.now()
  const daysUntilExpiry = Math.ceil(diffMs / MS_PER_DAY)

  return {
    endsAt: sub.ends_at,
    daysUntilExpiry,
    isExpired: diffMs <= 0,
    willExpireSoon: diffMs > 0 && daysUntilExpiry <= 3,
    willExpireVerySoon: diffMs > 0 && daysUntilExpiry <= 1,
    status: sub.status,
    plan: sub.plan,
  }
}

/**
 * 최근 결제 이력(과금 내역 조회용). 최대 20건.
 * @param {string} userId
 * @returns {Promise<Array<Subscription>>}
 */
export async function listRecentSubscriptions(userId) {
  assertUserId(userId)
  const { data, error } = await supabase
    .from(TABLE)
    .select('id, plan, status, starts_at, ends_at, gateway, payment_id, created_at')
    .eq('user_id', userId)
    .order('starts_at', { ascending: false })
    .limit(20)

  if (error) throw new Error(`결제 이력 조회 실패: ${error.message}`)
  return /** @type {Array<Subscription>} */ (data || [])
}
