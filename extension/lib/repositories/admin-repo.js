// repositories/admin-repo.js
// 관리자 전용 쿼리 추상화.
//
// 보안 모델:
//   - 모든 SELECT/UPDATE 는 RLS(`is_admin_user()`)로 보호된다.
//     호출자가 관리자가 아니면 DB 가 자체적으로 거절한다(RLS 신뢰).
//   - service_role 이 필요한 작업(force plan, toggle admin 등)은 본 모듈에서 하지 않는다.
//     반드시 admin-actions Edge Function 을 거친다(`callAdminAction`).
//   - 클라이언트는 service_role 을 절대 보유하지 않는다.

import { supabase } from '../supabase-client.js'

const PROFILES = 'profiles'
const APP_SETTINGS = 'app_settings'
const AUDIT_LOG = 'admin_audit_log'
const FN_ADMIN_ACTIONS = 'admin-actions'

const BANWORDS_KEY = 'banwords'

/** @typedef {'free' | 'pro' | 'unlimited'} Plan */

/**
 * @typedef AdminProfile
 * @property {string} id
 * @property {string} email
 * @property {string | null} display_name
 * @property {Plan} plan
 * @property {boolean} is_admin
 * @property {string} language
 * @property {string} created_at
 * @property {string} updated_at
 */

function assertNonEmpty(v, name) {
  if (typeof v !== 'string' || v.trim() === '') {
    throw new Error(`admin-repo: ${name} 가 비어 있습니다.`)
  }
}

// ─────────────────────────────────────────────────────────────
// 1) 사용자 목록 / 검색
// ─────────────────────────────────────────────────────────────

/**
 * 전체 사용자 목록 (관리자 RLS 적용).
 * @param {{ limit?: number, offset?: number, search?: string }} [opts]
 * @returns {Promise<{ rows: AdminProfile[], total: number | null }>}
 */
export async function listAllUsers(opts = {}) {
  const limit = clampInt(opts.limit, 50, 1, 200)
  const offset = clampInt(opts.offset, 0, 0, 100_000)

  let query = supabase
    .from(PROFILES)
    .select('id, email, display_name, plan, is_admin, language, created_at, updated_at', {
      count: 'exact',
    })

  const search = typeof opts.search === 'string' ? opts.search.trim() : ''
  if (search) {
    // % 와 _ 는 LIKE 와일드카드. 사용자 입력은 escape.
    const escaped = search.replace(/[%_]/g, (m) => '\\' + m)
    const term = `%${escaped}%`
    query = query.or(`email.ilike.${term},display_name.ilike.${term}`)
  }

  query = query.order('created_at', { ascending: false }).range(offset, offset + limit - 1)

  const { data, error, count } = await query
  if (error) throw new Error(`사용자 목록 조회 실패: ${error.message}`)
  return { rows: /** @type {AdminProfile[]} */ (data ?? []), total: count ?? null }
}

// ─────────────────────────────────────────────────────────────
// 2) 사용자 플랜 변경 (Edge Function 경유)
// ─────────────────────────────────────────────────────────────

/**
 * 사용자 plan 강제 변경. service_role 가 필요한 부수효과(subscriptions row 생성·감사)
 * 가 있어 Edge Function 으로 위임한다.
 * @param {string} userId
 * @param {Plan} plan
 * @param {{ durationDays?: number, reason?: string }} [opts]
 */
export async function updateUserPlan(userId, plan, opts = {}) {
  assertNonEmpty(userId, 'userId')
  if (!['free', 'pro', 'unlimited'].includes(plan)) {
    throw new Error(`admin-repo: 잘못된 plan: ${plan}`)
  }
  return callAdminAction('user.setPlan', {
    userId,
    plan,
    durationDays: Number.isFinite(opts.durationDays) ? Number(opts.durationDays) : undefined,
    reason: typeof opts.reason === 'string' ? opts.reason.slice(0, 500) : undefined,
  })
}

/**
 * 관리자 권한 부여/회수. service_role 필요 (감사 + 권한 escalation 경계).
 * @param {string} userId
 * @param {boolean} isAdmin
 * @param {{ reason?: string }} [opts]
 */
export async function toggleUserAdmin(userId, isAdmin, opts = {}) {
  assertNonEmpty(userId, 'userId')
  return callAdminAction('user.toggleAdmin', {
    userId,
    isAdmin: !!isAdmin,
    reason: typeof opts.reason === 'string' ? opts.reason.slice(0, 500) : undefined,
  })
}

// ─────────────────────────────────────────────────────────────
// 3) app_settings (RLS 가 admin INSERT/UPDATE 허용)
// ─────────────────────────────────────────────────────────────

/**
 * 모든 앱 설정 조회.
 * @returns {Promise<{ key: string, value: any, updated_at: string }[]>}
 */
export async function getAppSettings() {
  const { data, error } = await supabase
    .from(APP_SETTINGS)
    .select('key, value, updated_at')
    .order('key', { ascending: true })
  if (error) throw new Error(`설정 조회 실패: ${error.message}`)
  return data ?? []
}

/**
 * 단일 설정 upsert. 감사 로그를 위해 Edge Function 을 거친다.
 * (RLS 만으로도 가능하지만 변경 추적이 필요하므로 admin-actions 사용)
 * @param {string} key
 * @param {unknown} value
 */
export async function updateAppSetting(key, value) {
  assertNonEmpty(key, 'key')
  return callAdminAction('settings.set', { key, value })
}

// ─────────────────────────────────────────────────────────────
// 4) 금칙어 (app_settings.banwords)
// ─────────────────────────────────────────────────────────────

/**
 * 금칙어 목록 조회.
 * @returns {Promise<string[]>}
 */
export async function getBanWords() {
  const { data, error } = await supabase
    .from(APP_SETTINGS)
    .select('value')
    .eq('key', BANWORDS_KEY)
    .maybeSingle()
  if (error) throw new Error(`금칙어 조회 실패: ${error.message}`)
  const raw = data?.value
  if (Array.isArray(raw)) return raw.filter((s) => typeof s === 'string')
  if (raw && Array.isArray(raw.words)) {
    return raw.words.filter((s) => typeof s === 'string')
  }
  return []
}

/**
 * 금칙어 1개 추가. 동일 단어 중복은 자동 제거.
 * @param {string} word
 */
export async function addBanWord(word) {
  assertNonEmpty(word, 'word')
  const trimmed = word.trim().slice(0, 50)
  const current = await getBanWords()
  if (current.includes(trimmed)) {
    return { ok: true, alreadyExists: true }
  }
  const next = [...current, trimmed]
  return updateAppSetting(BANWORDS_KEY, { words: next })
}

/**
 * 금칙어 1개 삭제.
 * @param {string} word
 */
export async function removeBanWord(word) {
  assertNonEmpty(word, 'word')
  const current = await getBanWords()
  const next = current.filter((w) => w !== word)
  return updateAppSetting(BANWORDS_KEY, { words: next })
}

// ─────────────────────────────────────────────────────────────
// 5) 감사 로그 조회 (RLS: 관리자 SELECT)
// ─────────────────────────────────────────────────────────────

/**
 * 감사 로그 페이지네이션 조회.
 * @param {{ limit?: number, offset?: number, action?: string, adminId?: string, targetUserId?: string }} [opts]
 */
export async function listAuditLog(opts = {}) {
  const limit = clampInt(opts.limit, 50, 1, 200)
  const offset = clampInt(opts.offset, 0, 0, 100_000)

  let q = supabase
    .from(AUDIT_LOG)
    .select('id, admin_id, action, target_user_id, metadata, created_at', {
      count: 'exact',
    })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (typeof opts.action === 'string' && opts.action.trim()) {
    q = q.eq('action', opts.action.trim())
  }
  if (typeof opts.adminId === 'string' && opts.adminId.trim()) {
    q = q.eq('admin_id', opts.adminId.trim())
  }
  if (typeof opts.targetUserId === 'string' && opts.targetUserId.trim()) {
    q = q.eq('target_user_id', opts.targetUserId.trim())
  }

  const { data, error, count } = await q
  if (error) throw new Error(`감사 로그 조회 실패: ${error.message}`)
  return { rows: data ?? [], total: count ?? null }
}

// ─────────────────────────────────────────────────────────────
// 내부: admin-actions Edge Function 호출 래퍼
// ─────────────────────────────────────────────────────────────

/**
 * @param {string} action
 * @param {Record<string, unknown>} params
 */
async function callAdminAction(action, params) {
  const { data, error } = await supabase.functions.invoke(FN_ADMIN_ACTIONS, {
    body: { action, params: params ?? {} },
  })
  if (error) {
    const bodyErr = error?.context?.body?.error
    const message = bodyErr?.message || error.message || 'admin-actions 호출 실패'
    throw Object.assign(new Error(message), { code: bodyErr?.code || 'upstream_error' })
  }
  if (!data || data.ok !== true) {
    const code = data?.error?.code || 'unknown'
    const message = data?.error?.message || 'admin-actions 응답이 비정상입니다.'
    throw Object.assign(new Error(message), { code })
  }
  return data.data
}

function clampInt(raw, fallback, min, max) {
  const n = Number(raw)
  if (!Number.isFinite(n)) return fallback
  return Math.max(min, Math.min(max, Math.floor(n)))
}
