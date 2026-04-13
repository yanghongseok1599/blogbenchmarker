-- =============================================================================
-- 008_admin_audit.sql
-- admin_audit_log: 관리자 액션 감사 로그
-- 목적: admin-actions Edge Function 이 수행한 모든 관리자 작업의 감사 추적.
-- 참조: ARCHITECTURE.md §관리자, .claude/skills/supabase-migration-rules §2-3
--
-- 변경 이력:
--   2026-04-14  Phase 11 초판 (008 신규)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- admin_audit_log
-- 컬럼 설계:
--   id              BIGSERIAL PK — 시간 순 자연 정렬 + 페이지네이션 효율
--   admin_id        UUID FK profiles(id) ON DELETE SET NULL
--                   감사 로그는 관리자 계정 삭제 후에도 보존되어야 한다.
--                   (compliance: 책임자 주체가 사라져도 사실 자체는 남김)
--   action          TEXT — '{domain}.{verb}' 네이밍 ('user.setPlan', 'user.toggleAdmin',
--                                                     'settings.set', 'banword.add' 등)
--   target_user_id  UUID FK profiles(id) ON DELETE SET NULL
--                   액션 대상이 사용자인 경우만 채워짐. 시스템 작업은 NULL.
--   metadata        JSONB — 액션별 부가 정보 (변경 전/후 값, params 원본 등)
--   created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id              BIGSERIAL PRIMARY KEY,
  admin_id        UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  action          TEXT NOT NULL,
  target_user_id  UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 관리자별 최근 액션 조회 (감사 페이지 기본 정렬)
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_admin_created
  ON public.admin_audit_log(admin_id, created_at DESC);

-- 특정 사용자에 대한 액션 감사 추적
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_target_created
  ON public.admin_audit_log(target_user_id, created_at DESC)
  WHERE target_user_id IS NOT NULL;

-- 액션 타입별 집계 (예: '오늘 plan 변경 N건')
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_action_created
  ON public.admin_audit_log(action, created_at DESC);

-- metadata 검색 (예: 특정 plan 변경 이력)
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_metadata
  ON public.admin_audit_log USING GIN (metadata);

-- -----------------------------------------------------------------------------
-- RLS:
--   - 관리자만 SELECT (is_admin_user() 사용)
--   - INSERT/UPDATE/DELETE 정책 없음 → service_role 만 쓰기 가능
--     (admin-actions Edge Function 이 service_role 로 INSERT)
--   - 감사 로그는 사후 변경 금지 — UPDATE/DELETE 정책을 의도적으로 두지 않는다.
-- -----------------------------------------------------------------------------
ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_audit_log admin select" ON public.admin_audit_log;

CREATE POLICY "admin_audit_log admin select" ON public.admin_audit_log
  FOR SELECT USING (public.is_admin_user());

-- ROLLBACK:
-- DROP POLICY IF EXISTS "admin_audit_log admin select" ON public.admin_audit_log;
-- ALTER TABLE public.admin_audit_log DISABLE ROW LEVEL SECURITY;
-- DROP INDEX IF EXISTS public.idx_admin_audit_log_metadata;
-- DROP INDEX IF EXISTS public.idx_admin_audit_log_action_created;
-- DROP INDEX IF EXISTS public.idx_admin_audit_log_target_created;
-- DROP INDEX IF EXISTS public.idx_admin_audit_log_admin_created;
-- DROP TABLE IF EXISTS public.admin_audit_log;
