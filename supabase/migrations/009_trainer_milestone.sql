-- supabase/migrations/009_trainer_milestone.sql
-- 트레이너 마일스톤(trainer_milestone) 결제 게이트웨이 통합.
--
-- 변경 요지:
--   1. subscriptions.gateway CHECK 제약에 'trainer_milestone' 추가
--      → 기존 'toss' / 'portone' 도 유지 (마이그레이션 호환)
--   2. app_settings 에 billing_url, payment_provider 기본값 INSERT
--      → 운영자가 추후 Supabase 콘솔에서 실 URL 로 업데이트
--
-- 호환성:
--   - 기존 행에 영향 없음 (CHECK 확장만)
--   - app_settings INSERT 는 ON CONFLICT DO NOTHING 으로 idempotent

-- 1) gateway CHECK 제약 갱신
ALTER TABLE public.subscriptions
  DROP CONSTRAINT IF EXISTS subscriptions_gateway_check;

ALTER TABLE public.subscriptions
  ADD CONSTRAINT subscriptions_gateway_check
  CHECK (gateway IS NULL OR gateway IN ('toss', 'portone', 'trainer_milestone'));

-- 2) app_settings 기본값 (운영자가 콘솔에서 실 URL/식별자로 교체)
INSERT INTO public.app_settings (key, value)
VALUES
  ('billing_url',       '"https://trainermilestone.com/checkout"'::jsonb),
  ('payment_provider',  '"trainer_milestone"'::jsonb),
  ('billing_return_url','"https://trainermilestone.com/checkout/return"'::jsonb)
ON CONFLICT (key) DO NOTHING;
