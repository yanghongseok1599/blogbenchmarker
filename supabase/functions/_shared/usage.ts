// supabase/functions/_shared/usage.ts
// usage_logs 기록 + 쿼터 검증 헬퍼
//
// 쿼터 정책:
//   - 1분 하드 리밋: 10회 (DoS 방지, plan 무관)
//   - 1일 쿼터 (plan 별):
//       free        →  3
//       pro         →  100
//       unlimited   →  Infinity
//       is_admin    →  Infinity (plan 무시)
//
// 기준은 서버 시간(UTC). 일일 창은 "최근 24시간" rolling window 로 계산.

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import type { AuthProfile } from './auth.ts'

export type Feature =
  | 'generate_content'
  | 'analyze_seo'
  | 'extract_youtube'
  | 'benchmark_fetch'

export type QuotaCheck = {
  allowed: boolean
  reason?: 'rate_limit_minute' | 'quota_exceeded_day'
  minuteCount: number
  dailyCount: number
  dailyQuota: number
  minuteLimit: number
}

const MINUTE_LIMIT = 10
const DAILY_QUOTA_BY_PLAN: Record<AuthProfile['plan'], number> = {
  free:      3,
  pro:       100,
  unlimited: Number.POSITIVE_INFINITY
}

/**
 * 호출 전 쿼터 확인. profile 이 is_admin 이면 항상 allowed=true.
 */
export async function checkQuota(
  supabase: SupabaseClient,
  profile: AuthProfile,
  feature: Feature
): Promise<QuotaCheck> {
  // 관리자는 쿼터 무시
  if (profile.is_admin) {
    return {
      allowed: true,
      minuteCount: 0,
      dailyCount: 0,
      dailyQuota: Number.POSITIVE_INFINITY,
      minuteLimit: MINUTE_LIMIT
    }
  }

  const now = Date.now()
  const oneMinuteAgo = new Date(now - 60_000).toISOString()
  const oneDayAgo = new Date(now - 86_400_000).toISOString()

  // 두 개 count 쿼리를 병렬 실행
  const [minuteRes, dayRes] = await Promise.all([
    supabase
      .from('usage_logs')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', profile.id)
      .eq('feature', feature)
      .gte('created_at', oneMinuteAgo),
    supabase
      .from('usage_logs')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', profile.id)
      .eq('feature', feature)
      .gte('created_at', oneDayAgo)
  ])

  const minuteCount = minuteRes.count ?? 0
  const dailyCount = dayRes.count ?? 0
  const dailyQuota = DAILY_QUOTA_BY_PLAN[profile.plan] ?? DAILY_QUOTA_BY_PLAN.free

  if (minuteCount >= MINUTE_LIMIT) {
    return {
      allowed: false,
      reason: 'rate_limit_minute',
      minuteCount,
      dailyCount,
      dailyQuota,
      minuteLimit: MINUTE_LIMIT
    }
  }
  if (dailyCount >= dailyQuota) {
    return {
      allowed: false,
      reason: 'quota_exceeded_day',
      minuteCount,
      dailyCount,
      dailyQuota,
      minuteLimit: MINUTE_LIMIT
    }
  }
  return {
    allowed: true,
    minuteCount,
    dailyCount,
    dailyQuota,
    minuteLimit: MINUTE_LIMIT
  }
}

/**
 * 호출 성공/실패 후 사용 이력을 기록.
 * 실패 시에도 호출은 비동기 로그 — 본 응답에 영향 주지 않음(로그 실패 무시).
 */
export async function recordUsage(
  supabase: SupabaseClient,
  userId: string,
  feature: Feature,
  costTokens: number
): Promise<void> {
  const safeTokens = Number.isFinite(costTokens) && costTokens >= 0
    ? Math.floor(costTokens)
    : 0
  const { error } = await supabase.from('usage_logs').insert({
    user_id: userId,
    feature,
    cost_tokens: safeTokens
  })
  if (error) {
    // 관측 목적 로그. 사용자 식별자·토큰값·에러 메시지만 — API 키는 절대 로깅하지 않는다.
    console.warn('[usage] insert failed', { userId, feature, err: error.message })
  }
}

/**
 * 쿼터 거부 응답 빌더.
 */
export function quotaErrorResponse(
  check: QuotaCheck,
  corsHeaders: Record<string, string> = {}
): Response {
  const code = check.reason === 'rate_limit_minute' ? 'rate_limit' : 'quota_exceeded'
  const message =
    check.reason === 'rate_limit_minute'
      ? `너무 빠르게 요청하고 있습니다. 1분당 ${check.minuteLimit}회까지 가능합니다.`
      : `일일 사용량(${check.dailyQuota}회)을 초과했습니다. 플랜 업그레이드를 고려해 주세요.`
  const status = check.reason === 'rate_limit_minute' ? 429 : 429

  return new Response(
    JSON.stringify({
      ok: false,
      error: {
        code,
        message,
        details: {
          minuteCount: check.minuteCount,
          dailyCount: check.dailyCount,
          dailyQuota: isFinite(check.dailyQuota) ? check.dailyQuota : null,
          minuteLimit: check.minuteLimit
        }
      }
    }),
    { status, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
  )
}

export { MINUTE_LIMIT, DAILY_QUOTA_BY_PLAN }
