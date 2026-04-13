// repositories/user-repo.js
// profiles 테이블 접근을 추상화하는 저장소 계층.
// - 컴포넌트/핸들러는 supabase 클라이언트를 직접 호출하지 않고 이 모듈만 import 한다.
// - 진실의 원천은 Supabase, chrome.storage 는 캐시 용도만 (ARCHITECTURE.md §상태 관리).
// - RLS 가 본인 격리를 강제하므로 클라이언트에서 추가 권한 체크는 생략 (DB 가 거절하면 error 전달).
//
// 관련 스키마: _workspace/backend_schema_changelog.md §1.1
//   profiles(id UUID PK, email TEXT, display_name TEXT, plan TEXT, is_admin BOOLEAN, created_at TIMESTAMPTZ)

import { supabase } from '../supabase-client.js'

const TABLE = 'profiles'

/**
 * @typedef {Object} Profile
 * @property {string} id              auth.users(id) 와 동일한 UUID
 * @property {string} email
 * @property {string | null} display_name
 * @property {'free' | 'pro' | 'unlimited'} plan
 * @property {boolean} is_admin
 * @property {string} created_at      ISO8601
 */

/**
 * 업데이트 가능한 필드만 허용하는 화이트리스트.
 * id / email / is_admin / created_at 은 트리거/관리자 경로에서만 변경되어야 한다.
 * plan 은 서버(verify-subscription Edge Function)에서만 변경한다.
 * @type {ReadonlyArray<keyof Profile>}
 */
const UPDATABLE_FIELDS = Object.freeze(['display_name'])

/**
 * userId 의 유효성을 간단히 검사한다(UUID v4 형식 대충).
 * RLS 가 최종 검증하므로 여기선 null/빈 문자열만 차단.
 * @param {string} userId
 */
function assertUserId(userId) {
  if (!userId || typeof userId !== 'string') {
    throw new Error('user-repo: userId 가 비어 있습니다.')
  }
}

/**
 * patch 를 화이트리스트 필드로만 축소한다.
 * @param {Partial<Profile>} patch
 * @returns {Partial<Profile>} 화이트리스트 적용된 객체 (비어 있을 수 있음)
 */
function sanitizePatch(patch) {
  if (!patch || typeof patch !== 'object') return {}
  /** @type {Partial<Profile>} */
  const out = {}
  for (const key of UPDATABLE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(patch, key)) {
      // @ts-expect-error 동적 key 할당
      out[key] = patch[key]
    }
  }
  return out
}

/**
 * 프로필 조회.
 * RLS 때문에 다른 사용자 userId 로 호출하면 null 이 반환된다(관리자 제외).
 * @param {string} userId profiles.id
 * @returns {Promise<Profile | null>} 존재하지 않으면 null
 */
export async function getProfile(userId) {
  assertUserId(userId)
  const { data, error } = await supabase
    .from(TABLE)
    .select('id, email, display_name, plan, is_admin, created_at')
    .eq('id', userId)
    .maybeSingle()

  if (error) throw new Error(`프로필 조회 실패: ${error.message}`)
  return /** @type {Profile | null} */ (data)
}

/**
 * 프로필 부분 업데이트.
 * UPDATABLE_FIELDS 외 필드는 자동으로 제거된다(예: plan, is_admin).
 * @param {string} userId profiles.id
 * @param {Partial<Profile>} patch 적용할 필드 (display_name 만 실제 반영)
 * @returns {Promise<Profile>} 갱신된 프로필 전체 행
 */
export async function updateProfile(userId, patch) {
  assertUserId(userId)
  const sanitized = sanitizePatch(patch)
  if (Object.keys(sanitized).length === 0) {
    throw new Error('updateProfile: 업데이트 가능한 필드가 없습니다. (display_name 만 허용)')
  }

  const { data, error } = await supabase
    .from(TABLE)
    .update(sanitized)
    .eq('id', userId)
    .select('id, email, display_name, plan, is_admin, created_at')
    .single()

  if (error) throw new Error(`프로필 업데이트 실패: ${error.message}`)
  return /** @type {Profile} */ (data)
}

/**
 * 관리자 여부 판정.
 * RLS 상 본인 프로필이거나 관리자가 조회한 경우에만 is_admin 값이 돌아온다.
 * 조회 실패/미존재는 false 로 안전하게 처리한다(권한 에스컬레이션 방지).
 * @param {string} userId profiles.id
 * @returns {Promise<boolean>}
 */
export async function isAdmin(userId) {
  assertUserId(userId)
  const { data, error } = await supabase
    .from(TABLE)
    .select('is_admin')
    .eq('id', userId)
    .maybeSingle()

  if (error) {
    // 로그만 남기고 false 반환 — 관리자 권한은 "확정적으로 true" 인 경우에만 부여.
    console.warn(`[user-repo] isAdmin 조회 실패: ${error.message}`)
    return false
  }
  return data?.is_admin === true
}
