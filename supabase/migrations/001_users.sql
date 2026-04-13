-- =============================================================================
-- 001_users.sql
-- profiles 테이블 + auth.users INSERT 시 자동 동기화 트리거
-- 목적: Supabase Auth 유저가 생성되면 public.profiles에 1:1 매핑 행을 자동 생성한다.
-- 참조: ARCHITECTURE.md §users, .claude/skills/supabase-migration-rules §3
-- =============================================================================

-- profiles: auth.users를 확장하는 사용자 메타 테이블
CREATE TABLE IF NOT EXISTS public.profiles (
  id           UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email        TEXT NOT NULL,
  display_name TEXT,
  plan         TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'pro', 'unlimited')),
  is_admin     BOOLEAN NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 이메일 검색 및 중복 탐지를 위한 인덱스
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);
-- 관리자 조회 최적화 (RLS 정책의 EXISTS 서브쿼리에서 사용)
CREATE INDEX IF NOT EXISTS idx_profiles_is_admin ON public.profiles(id) WHERE is_admin = true;

-- -----------------------------------------------------------------------------
-- auth.users INSERT → public.profiles 자동 생성 트리거
-- SECURITY DEFINER + search_path 고정: permission escalation 방지
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name, plan)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)),
    'free'
  )
  ON CONFLICT (id) DO NOTHING;  -- 재실행 안전성
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ROLLBACK:
-- DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
-- DROP FUNCTION IF EXISTS public.handle_new_user();
-- DROP INDEX IF EXISTS public.idx_profiles_is_admin;
-- DROP INDEX IF EXISTS public.idx_profiles_email;
-- DROP TABLE IF EXISTS public.profiles;
