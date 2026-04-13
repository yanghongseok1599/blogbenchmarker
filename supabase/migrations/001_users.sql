-- =============================================================================
-- 001_users.sql
-- profiles 테이블 + auth.users INSERT 시 자동 동기화 트리거
-- 목적: Supabase Auth 유저가 생성되면 public.profiles에 1:1 매핑 행을 자동 생성한다.
-- 참조: ARCHITECTURE.md §users, .claude/skills/supabase-migration-rules §3
--
-- 변경 이력:
--   2026-04-14  language, updated_at 컬럼 추가 (QA F-4)
--               handle_new_user 예외 정책 주석화 (QA F-3)
--               email 이중 저장 근거 주석화 (QA H-1)
-- =============================================================================

-- profiles: auth.users를 확장하는 사용자 메타 테이블
--
-- email 컬럼이 auth.users.email 과 이중 저장되는 이유(QA H-1):
--   1) RLS 정책 서브쿼리에서 auth.users 에 조인 없이 profiles 만으로 조건 검증 가능
--      (auth 스키마는 기본 권한이 제한적이라 일반 쿼리에서 조인 비용·권한 문제 발생).
--   2) is_admin, plan, display_name 등 우리 도메인 필드와 같은 행에서 원자적 조회.
--   동기화 책임: 현재는 회원가입 시 handle_new_user() 가 최초 복사.
--   이후 auth.users.email 변경 시 별도 트리거(TODO: handle_user_email_update)로 반영 예정.
CREATE TABLE IF NOT EXISTS public.profiles (
  id           UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email        TEXT NOT NULL,
  display_name TEXT,
  plan         TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'pro', 'unlimited')),
  is_admin     BOOLEAN NOT NULL DEFAULT false,
  language     TEXT NOT NULL DEFAULT 'ko',          -- 다국어 UI (_locales/ko,en,ja)
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()   -- 프로필 수정 추적 (마이페이지 "마지막 수정" 표시용)
);

-- 이미 배포된 환경에 대한 idempotent 패치 (신규 배포는 위 CREATE 에서 이미 반영)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS language   TEXT NOT NULL DEFAULT 'ko';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- 이메일 검색 및 중복 탐지를 위한 인덱스
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);
-- 관리자 조회 최적화 (RLS 정책의 is_admin_user() 함수에서 사용 — 006_rls.sql 참조)
CREATE INDEX IF NOT EXISTS idx_profiles_is_admin ON public.profiles(id) WHERE is_admin = true;

-- -----------------------------------------------------------------------------
-- updated_at 자동 갱신 트리거
-- 설계: moddatetime 확장 의존 없이 plpgsql 함수로 구현 (확장 관리 비용 최소화).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_set_updated_at ON public.profiles;
CREATE TRIGGER trg_profiles_set_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- -----------------------------------------------------------------------------
-- auth.users INSERT → public.profiles 자동 생성 트리거
-- SECURITY DEFINER + search_path 고정: permission escalation 방지.
--
-- 실패 정책(QA F-3):
--   본 함수에서 예외가 발생하면 auth.users INSERT 전체 트랜잭션이 롤백되어
--   회원가입이 차단된다. 이는 **의도된 설계**다.
--     - 근거: profiles 행이 없으면 RLS 가 모든 후속 요청을 거부하므로
--             반쪽짜리 가입 상태(auth.users 만 존재, profiles 없음)는 즉시
--             복구 불가능한 고아 계정을 만든다.
--     - 결과: 스키마/제약 위반이 있으면 "가입 실패"로 사용자에게 즉시 전달됨.
--   실패 허용이 필요한 날이 오면(예: 대량 마이그레이션 후 느린 백필),
--     EXCEPTION WHEN OTHERS THEN INSERT INTO public.signup_failures(...); RETURN NEW; END
--   블록을 추가하고 pgaudit 로 감사 경로를 보존할 것.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name, plan, language)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)),
    'free',
    COALESCE(NEW.raw_user_meta_data->>'language', 'ko')
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
-- DROP TRIGGER IF EXISTS trg_profiles_set_updated_at ON public.profiles;
-- DROP FUNCTION IF EXISTS public.set_updated_at();
-- DROP INDEX IF EXISTS public.idx_profiles_is_admin;
-- DROP INDEX IF EXISTS public.idx_profiles_email;
-- ALTER TABLE public.profiles DROP COLUMN IF EXISTS updated_at;
-- ALTER TABLE public.profiles DROP COLUMN IF EXISTS language;
-- DROP TABLE IF EXISTS public.profiles;
