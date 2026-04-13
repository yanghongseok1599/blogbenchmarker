-- =============================================================================
-- 006_rls.sql
-- 모든 public 테이블 ENABLE ROW LEVEL SECURITY + auth.uid() 기반 정책
-- 원칙:
--   - 모든 테이블 RLS ON (예외 없음)
--   - 본인 데이터만 CRUD (auth.uid() = user_id)
--   - 관리자는 profiles.is_admin = true (이메일 비교/JWT 클레임 금지)
--   - INSERT 는 WITH CHECK, 기존 행 접근은 USING
-- 참조: ARCHITECTURE.md §RLS 정책, .claude/skills/supabase-migration-rules §2
--
-- 변경 이력:
--   2026-04-14  is_admin_user() 함수 추출 — 관리자 판정 EXISTS 6회 복제 DRY (QA G-3)
--               FORCE ROW LEVEL SECURITY 결정 명시화 (QA D-3)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- FORCE ROW LEVEL SECURITY 결정(QA D-3)
--
-- 결정: **FORCE RLS 는 적용하지 않는다.**
-- 근거:
--   1) handle_new_user() 트리거는 SECURITY DEFINER 로 실행되며
--      함수 소유자(일반적으로 supabase_admin)가 곧 profiles 테이블의 소유자다.
--      FORCE RLS 를 켜면 트리거 INSERT 조차 정책 검증 대상이 되어,
--      "본인만 INSERT 가능" 정책 하에서 auth.uid() 가 NULL 이거나
--      새 사용자 본인인지 판정 타이밍 이슈로 회원가입이 차단될 수 있다.
--   2) Edge Function 에서 service_role 로 수행하는 관리 작업
--      (예: verify-subscription webhook, admin-actions)은 RLS 를 의도적으로 우회해야 한다.
--   3) 테이블 소유자 우회로 인한 실제 위협 표면은 "DB 에 직접 접속한 postgres/supabase_admin"
--      이며, 이는 Supabase 프로젝트 권한(서비스 키 관리)으로 통제한다.
--
-- 결과: 소유자/SECURITY DEFINER 함수/service_role 의 RLS 우회를 **의도적으로 허용**한다.
--       일반 사용자(anon/authenticated) 는 모든 테이블에 대해 아래 정책으로만 접근한다.
-- -----------------------------------------------------------------------------

-- -----------------------------------------------------------------------------
-- 관리자 판정 함수 (QA G-3)
-- 기존 EXISTS 서브쿼리 6회 복제를 단일 함수로 DRY.
-- STABLE: 동일 트랜잭션 내 결과가 변하지 않음 → 플래너 캐시 활용.
-- SECURITY DEFINER + search_path 고정: RLS 정책 내부에서 호출되어도
--   policy recursion(profiles 를 조회하는 profiles 정책 평가) 위험 회피 —
--   함수 본문은 DEFINER 권한으로 실행되므로 profiles RLS 를 우회해 안전하게 확인.
-- idx_profiles_is_admin partial 인덱스가 그대로 사용됨(is_admin = true 조건).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_admin_user(uid UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = uid AND is_admin = true
  );
$$;

-- anon/authenticated 역할이 RLS 정책 내부에서 이 함수를 호출할 수 있어야 한다.
GRANT EXECUTE ON FUNCTION public.is_admin_user(UUID) TO anon, authenticated;

-- -----------------------------------------------------------------------------
-- profiles
-- -----------------------------------------------------------------------------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles own select"  ON public.profiles;
DROP POLICY IF EXISTS "profiles own update"  ON public.profiles;
DROP POLICY IF EXISTS "profiles admin all"   ON public.profiles;

-- 본인 프로필 조회
CREATE POLICY "profiles own select" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

-- 본인 프로필 수정 (id/plan/is_admin 등 민감 필드 변경은 Edge Function에서 별도 검증)
CREATE POLICY "profiles own update" ON public.profiles
  FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- 관리자: 모든 프로필 전권 (조회/수정/삭제)
CREATE POLICY "profiles admin all" ON public.profiles
  FOR ALL USING (public.is_admin_user());
-- 참고: INSERT 는 auth.users 트리거(handle_new_user)가 SECURITY DEFINER로 수행하므로
--       일반 사용자용 INSERT 정책은 두지 않는다.

-- -----------------------------------------------------------------------------
-- learning_data: 본인만 CRUD
-- -----------------------------------------------------------------------------
ALTER TABLE public.learning_data ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "learning_data own select" ON public.learning_data;
DROP POLICY IF EXISTS "learning_data own insert" ON public.learning_data;
DROP POLICY IF EXISTS "learning_data own update" ON public.learning_data;
DROP POLICY IF EXISTS "learning_data own delete" ON public.learning_data;

CREATE POLICY "learning_data own select" ON public.learning_data
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "learning_data own insert" ON public.learning_data
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "learning_data own update" ON public.learning_data
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "learning_data own delete" ON public.learning_data
  FOR DELETE USING (auth.uid() = user_id);

-- -----------------------------------------------------------------------------
-- benchmark_blogs: 본인만 CRUD
-- -----------------------------------------------------------------------------
ALTER TABLE public.benchmark_blogs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "benchmark_blogs own select" ON public.benchmark_blogs;
DROP POLICY IF EXISTS "benchmark_blogs own insert" ON public.benchmark_blogs;
DROP POLICY IF EXISTS "benchmark_blogs own update" ON public.benchmark_blogs;
DROP POLICY IF EXISTS "benchmark_blogs own delete" ON public.benchmark_blogs;

CREATE POLICY "benchmark_blogs own select" ON public.benchmark_blogs
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "benchmark_blogs own insert" ON public.benchmark_blogs
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "benchmark_blogs own update" ON public.benchmark_blogs
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "benchmark_blogs own delete" ON public.benchmark_blogs
  FOR DELETE USING (auth.uid() = user_id);

-- -----------------------------------------------------------------------------
-- benchmark_posts: benchmark_blogs 소유자 기준 간접 검증
-- (posts 테이블에는 user_id가 없으므로 blog_id를 통해 소유권 확인)
-- -----------------------------------------------------------------------------
ALTER TABLE public.benchmark_posts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "benchmark_posts own select" ON public.benchmark_posts;
DROP POLICY IF EXISTS "benchmark_posts own insert" ON public.benchmark_posts;
DROP POLICY IF EXISTS "benchmark_posts own update" ON public.benchmark_posts;
DROP POLICY IF EXISTS "benchmark_posts own delete" ON public.benchmark_posts;

CREATE POLICY "benchmark_posts own select" ON public.benchmark_posts
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.benchmark_blogs b
      WHERE b.id = benchmark_posts.blog_id AND b.user_id = auth.uid()
    )
  );

CREATE POLICY "benchmark_posts own insert" ON public.benchmark_posts
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.benchmark_blogs b
      WHERE b.id = benchmark_posts.blog_id AND b.user_id = auth.uid()
    )
  );

CREATE POLICY "benchmark_posts own update" ON public.benchmark_posts
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.benchmark_blogs b
      WHERE b.id = benchmark_posts.blog_id AND b.user_id = auth.uid()
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.benchmark_blogs b
      WHERE b.id = benchmark_posts.blog_id AND b.user_id = auth.uid()
    )
  );

CREATE POLICY "benchmark_posts own delete" ON public.benchmark_posts
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.benchmark_blogs b
      WHERE b.id = benchmark_posts.blog_id AND b.user_id = auth.uid()
    )
  );

-- -----------------------------------------------------------------------------
-- usage_logs: 본인 SELECT/INSERT. UPDATE/DELETE 는 금지(이력 무결성 보장)
-- 필요 시 관리자만 수정/삭제 가능.
-- -----------------------------------------------------------------------------
ALTER TABLE public.usage_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "usage_logs own select" ON public.usage_logs;
DROP POLICY IF EXISTS "usage_logs own insert" ON public.usage_logs;
DROP POLICY IF EXISTS "usage_logs admin all" ON public.usage_logs;

CREATE POLICY "usage_logs own select" ON public.usage_logs
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "usage_logs own insert" ON public.usage_logs
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "usage_logs admin all" ON public.usage_logs
  FOR ALL USING (public.is_admin_user());

-- -----------------------------------------------------------------------------
-- app_settings: 공개 SELECT, 관리자만 INSERT/UPDATE/DELETE
-- -----------------------------------------------------------------------------
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "app_settings public select" ON public.app_settings;
DROP POLICY IF EXISTS "app_settings admin insert" ON public.app_settings;
DROP POLICY IF EXISTS "app_settings admin update" ON public.app_settings;
DROP POLICY IF EXISTS "app_settings admin delete" ON public.app_settings;

CREATE POLICY "app_settings public select" ON public.app_settings
  FOR SELECT USING (true);

CREATE POLICY "app_settings admin insert" ON public.app_settings
  FOR INSERT WITH CHECK (public.is_admin_user());

CREATE POLICY "app_settings admin update" ON public.app_settings
  FOR UPDATE USING (public.is_admin_user())
  WITH CHECK (public.is_admin_user());

CREATE POLICY "app_settings admin delete" ON public.app_settings
  FOR DELETE USING (public.is_admin_user());

-- -----------------------------------------------------------------------------
-- subscriptions: 본인 SELECT. INSERT/UPDATE/DELETE 는 Edge Function(service_role)에서만.
-- service_role 은 RLS 우회이므로 일반 사용자용 쓰기 정책을 의도적으로 두지 않는다.
-- -----------------------------------------------------------------------------
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "subscriptions own select" ON public.subscriptions;
DROP POLICY IF EXISTS "subscriptions admin all" ON public.subscriptions;

CREATE POLICY "subscriptions own select" ON public.subscriptions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "subscriptions admin all" ON public.subscriptions
  FOR ALL USING (public.is_admin_user());

-- ROLLBACK:
-- ALTER TABLE public.subscriptions    DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.app_settings     DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.usage_logs       DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.benchmark_posts  DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.benchmark_blogs  DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.learning_data    DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.profiles         DISABLE ROW LEVEL SECURITY;
-- REVOKE EXECUTE ON FUNCTION public.is_admin_user(UUID) FROM anon, authenticated;
-- DROP FUNCTION IF EXISTS public.is_admin_user(UUID);
-- (정책은 DROP POLICY IF EXISTS 로 일괄 제거)
