-- =============================================================================
-- 005_settings.sql
-- app_settings + subscriptions: 전역 앱 설정 및 결제/구독 이력
-- 목적:
--   app_settings  - 관리자가 제어하는 전역 플래그/값 (key-value JSONB)
--   subscriptions - 토스/포트원 결제 검증 후 기록되는 구독 이력
-- 참조: ARCHITECTURE.md §app_settings, §subscriptions
-- =============================================================================

-- -----------------------------------------------------------------------------
-- app_settings: key-value 전역 설정 (관리자만 쓰기 가능, 읽기는 공개)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.app_settings (
  key         TEXT PRIMARY KEY,
  value       JSONB NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- value 내부 필터링용 인덱스
CREATE INDEX IF NOT EXISTS idx_app_settings_value
  ON public.app_settings USING GIN (value);

-- -----------------------------------------------------------------------------
-- subscriptions: 결제 성공 시 기록되는 구독 이력
-- user_id 삭제 시 결제 이력도 정리 (CASCADE) — GDPR 계정 삭제 요구 대응
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  plan         TEXT NOT NULL CHECK (plan IN ('free', 'pro', 'unlimited')),
  starts_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ends_at      TIMESTAMPTZ,                     -- NULL = 무기한 (unlimited 등)
  gateway_ref  TEXT,                            -- 결제 게이트웨이(토스/포트원)의 결제 ID
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 사용자별 구독 조회: 최신 구독 확인용
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_starts
  ON public.subscriptions(user_id, starts_at DESC);

-- 만료 예정 구독 일괄 조회 (cron/배치용)
CREATE INDEX IF NOT EXISTS idx_subscriptions_ends_at
  ON public.subscriptions(ends_at) WHERE ends_at IS NOT NULL;

-- gateway_ref로 중복 결제 방지 조회
CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_gateway_ref
  ON public.subscriptions(gateway_ref) WHERE gateway_ref IS NOT NULL;

-- ROLLBACK:
-- DROP INDEX IF EXISTS public.idx_subscriptions_gateway_ref;
-- DROP INDEX IF EXISTS public.idx_subscriptions_ends_at;
-- DROP INDEX IF EXISTS public.idx_subscriptions_user_starts;
-- DROP TABLE IF EXISTS public.subscriptions;
-- DROP INDEX IF EXISTS public.idx_app_settings_value;
-- DROP TABLE IF EXISTS public.app_settings;
