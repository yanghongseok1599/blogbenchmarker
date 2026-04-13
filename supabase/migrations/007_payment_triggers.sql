-- =============================================================================
-- 007_payment_triggers.sql
-- subscriptions 상태 변화 → profiles.plan 자동 동기화 + 만료 배치 함수.
--
-- 설계 원칙:
--   - 진실의 원천은 subscriptions 테이블. profiles.plan 은 파생값으로 취급하되
--     빈번한 READ 를 위해 denormalize 로 보관한다.
--   - AFTER INSERT/UPDATE/DELETE 트리거가 해당 user 의 현재 최고 활성 plan 을
--     재계산해 profiles.plan 을 덮어쓴다 (멱등).
--   - 만료 처리는 pure DB 에서 '시간 트리거' 가 불가능하므로, SECURITY DEFINER
--     함수 public.expire_due_subscriptions() 를 두고 Supabase pg_cron 또는
--     외부 스케줄러(Edge Function / 운영자 수동 호출) 가 주기적으로 호출한다.
--   - 해당 함수가 status='active' AND ends_at<NOW() 행을 'expired' 로 전환하면,
--     위 트리거가 연쇄적으로 profiles.plan 을 'free' 로 되돌린다.
--
-- 참조:
--   - supabase/migrations/005_settings.sql  (subscriptions 컬럼/제약)
--   - supabase/functions/verify-subscription (webhook 에서 status 전이)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) plan 우선순위 — 최고 등급이 이긴다.
--    free(0) < pro(1) < unlimited(2)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.plan_rank(p TEXT)
RETURNS INTEGER
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p
    WHEN 'unlimited' THEN 2
    WHEN 'pro'       THEN 1
    ELSE 0
  END
$$;

-- -----------------------------------------------------------------------------
-- 2) 유저의 현재 유효 plan 계산
--    active + (ends_at IS NULL OR ends_at > NOW()) 중 최고 rank.
--    해당 행이 없으면 'free'.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.compute_effective_plan(p_user_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  effective TEXT;
BEGIN
  SELECT s.plan INTO effective
  FROM public.subscriptions s
  WHERE s.user_id = p_user_id
    AND s.status  = 'active'
    AND (s.ends_at IS NULL OR s.ends_at > NOW())
  ORDER BY public.plan_rank(s.plan) DESC, s.starts_at DESC
  LIMIT 1;

  RETURN COALESCE(effective, 'free');
END;
$$;

-- -----------------------------------------------------------------------------
-- 3) profiles.plan 을 재계산해 동기화
--    (is_admin 여부와 무관 — 관리자도 본인 플랜을 따로 가진다.)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.refresh_user_plan(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_plan TEXT;
BEGIN
  IF p_user_id IS NULL THEN RETURN; END IF;
  new_plan := public.compute_effective_plan(p_user_id);

  UPDATE public.profiles
  SET plan = new_plan
  WHERE id = p_user_id
    AND plan IS DISTINCT FROM new_plan;
END;
$$;

-- -----------------------------------------------------------------------------
-- 4) subscriptions 변화 → 해당 user 의 plan 재계산
--    INSERT/UPDATE 는 NEW.user_id, DELETE 는 OLD.user_id 사용.
--    UPDATE 에서 user_id 가 바뀌는 경우는 설계상 없지만 방어적으로 둘 다 처리.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.subscriptions_sync_plan()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.refresh_user_plan(OLD.user_id);
    RETURN OLD;
  END IF;

  PERFORM public.refresh_user_plan(NEW.user_id);
  IF TG_OP = 'UPDATE' AND NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    PERFORM public.refresh_user_plan(OLD.user_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_subscriptions_sync_plan ON public.subscriptions;
CREATE TRIGGER trg_subscriptions_sync_plan
  AFTER INSERT OR UPDATE OR DELETE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.subscriptions_sync_plan();

-- -----------------------------------------------------------------------------
-- 5) 만료 배치 함수
--    status='active' AND ends_at < NOW() 인 구독을 'expired' 로 전환.
--    위 트리거가 연쇄 발화 → profiles.plan 이 자동 재계산되어 'free' 로 복귀.
--
--    이 함수는 service_role (또는 관리자 직접) 이 호출한다.
--    Supabase pg_cron 이 활성화된 프로젝트에서는 다음과 같이 스케줄링 권장:
--      SELECT cron.schedule('expire-subscriptions',
--        '*/15 * * * *',
--        $$SELECT public.expire_due_subscriptions()$$);
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.expire_due_subscriptions()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected INTEGER;
BEGIN
  UPDATE public.subscriptions
  SET status = 'expired'
  WHERE status = 'active'
    AND ends_at IS NOT NULL
    AND ends_at < NOW();
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$;

-- -----------------------------------------------------------------------------
-- 6) 최초 배포 시 기존 데이터 정합화 (idempotent):
--    현재 subscriptions 상황과 profiles.plan 을 한 번 맞춘다.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT id FROM public.profiles LOOP
    PERFORM public.refresh_user_plan(r.id);
  END LOOP;
END $$;

-- ROLLBACK:
-- DROP TRIGGER IF EXISTS trg_subscriptions_sync_plan ON public.subscriptions;
-- DROP FUNCTION IF EXISTS public.subscriptions_sync_plan();
-- DROP FUNCTION IF EXISTS public.refresh_user_plan(UUID);
-- DROP FUNCTION IF EXISTS public.compute_effective_plan(UUID);
-- DROP FUNCTION IF EXISTS public.plan_rank(TEXT);
-- DROP FUNCTION IF EXISTS public.expire_due_subscriptions();
