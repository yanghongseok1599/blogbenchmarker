-- =============================================================================
-- 006_rls.sql
-- 모든 public 테이블 ENABLE ROW LEVEL SECURITY + auth.uid() 기반 정책
-- 원칙:
--   - 모든 테이블 RLS ON (예외 없음)
--   - 본인 데이터만 CRUD (auth.uid() = user_id)
--   - 관리자는 profiles.is_admin = true (이메일 비교/JWT 클레임 금지)
--   - INSERT 는 WITH CHECK, 기존 행 접근은 USING
-- 참조: ARCHITECTURE.md §RLS 정책, .claude/skills/supabase-migration-rules §2
-- =============================================================================

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
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin)
  );
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
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin)
  );

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
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin)
  );

CREATE POLICY "app_settings admin update" ON public.app_settings
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin)
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin)
  );

CREATE POLICY "app_settings admin delete" ON public.app_settings
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin)
  );

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
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin)
  );

-- ROLLBACK:
-- ALTER TABLE public.subscriptions    DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.app_settings     DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.usage_logs       DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.benchmark_posts  DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.benchmark_blogs  DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.learning_data    DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.profiles         DISABLE ROW LEVEL SECURITY;
-- (정책은 DROP POLICY IF EXISTS 로 일괄 제거)
