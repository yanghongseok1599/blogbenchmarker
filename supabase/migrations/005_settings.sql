-- =============================================================================
-- 005_settings.sql
-- app_settings + subscriptions: 전역 앱 설정 및 결제/구독 이력
-- 목적:
--   app_settings  - 관리자가 제어하는 전역 플래그/값 (key-value JSONB)
--   subscriptions - 토스/포트원 결제 검증 후 기록되는 구독 이력
-- 참조: ARCHITECTURE.md §app_settings, §subscriptions
--
-- 변경 이력:
--   2026-04-14  subscriptions 재설계 (QA B-3 / B-4):
--                 - status 컬럼 추가 (active/cancelled/expired/refunded)
--                 - gateway_ref 제거 → gateway + payment_id 2컬럼 분리
--                 - UNIQUE(gateway, payment_id) 복합 제약
--                 - 활성 구독 partial 인덱스 추가
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
--
-- 결제 게이트웨이 설계(QA B-4):
--   다중 PG사(토스/포트원) 병행을 지원하기 위해 provider + provider-scope ID 를 분리.
--   UNIQUE(gateway, payment_id) 복합 제약으로 webhook 재시도 시 중복 INSERT 방지.
--   단일 컬럼(gateway_ref)만 사용하면 PG사별 ID 네임스페이스가 섞여 충돌 가능.
--
-- 상태 전이(QA B-3):
--   active    → 사용 중 (ends_at IS NULL OR ends_at > NOW())
--   cancelled → 사용자가 해지 예약 (ends_at 시점까지는 active 혜택 유지)
--   expired   → 만료됨 (cron 배치가 ends_at < NOW() 인 active 행을 전환)
--   refunded  → 환불 완료 (webhook 수신 시 전환, plan 혜택 즉시 회수)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  plan         TEXT NOT NULL CHECK (plan IN ('free', 'pro', 'unlimited')),
  status       TEXT NOT NULL DEFAULT 'active'
                 CHECK (status IN ('active', 'cancelled', 'expired', 'refunded')),
  starts_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ends_at      TIMESTAMPTZ,                              -- NULL = 무기한 (unlimited 등)
  gateway      TEXT CHECK (gateway IN ('toss', 'portone')),  -- 결제 게이트웨이 식별자
  payment_id   TEXT,                                     -- gateway 내부 결제 ID (webhook 재시도 키)
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_subscriptions_gateway_payment UNIQUE (gateway, payment_id)
);

-- 이미 배포된 환경에 대한 idempotent 패치 (신규 배포는 위 CREATE 에서 이미 반영)
-- 기존 gateway_ref 컬럼이 있으면 payment_id 로 RENAME, gateway 컬럼은 새로 추가
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'subscriptions' AND column_name = 'gateway_ref'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'subscriptions' AND column_name = 'payment_id'
  ) THEN
    ALTER TABLE public.subscriptions RENAME COLUMN gateway_ref TO payment_id;
  END IF;
END $$;

ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS gateway TEXT;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS payment_id TEXT;

-- 기존 단일 컬럼 UNIQUE 인덱스가 있으면 제거 (복합 UNIQUE 제약으로 대체)
DROP INDEX IF EXISTS public.idx_subscriptions_gateway_ref;

-- status CHECK 재부착 (ADD COLUMN 으로 생성된 경우 CHECK 없으므로 idempotent 재적용)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'subscriptions_status_check'
      AND conrelid = 'public.subscriptions'::regclass
  ) THEN
    ALTER TABLE public.subscriptions
      ADD CONSTRAINT subscriptions_status_check
      CHECK (status IN ('active', 'cancelled', 'expired', 'refunded'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'subscriptions_gateway_check'
      AND conrelid = 'public.subscriptions'::regclass
  ) THEN
    ALTER TABLE public.subscriptions
      ADD CONSTRAINT subscriptions_gateway_check
      CHECK (gateway IS NULL OR gateway IN ('toss', 'portone'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'uq_subscriptions_gateway_payment'
      AND conrelid = 'public.subscriptions'::regclass
  ) THEN
    ALTER TABLE public.subscriptions
      ADD CONSTRAINT uq_subscriptions_gateway_payment UNIQUE (gateway, payment_id);
  END IF;
END $$;

-- 사용자별 구독 조회: 최신 구독 확인용
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_starts
  ON public.subscriptions(user_id, starts_at DESC);

-- 활성 구독 조회 최적화 (QA B-3 / C-4): 가장 빈번한 쿼리 — "이 사용자의 현재 플랜"
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_status_active
  ON public.subscriptions(user_id, status)
  WHERE status = 'active';

-- 만료 예정 구독 일괄 조회 (cron/배치용) — active 이면서 ends_at 이 있는 행만
CREATE INDEX IF NOT EXISTS idx_subscriptions_ends_at
  ON public.subscriptions(ends_at)
  WHERE ends_at IS NOT NULL AND status = 'active';

-- ROLLBACK:
-- DROP INDEX IF EXISTS public.idx_subscriptions_ends_at;
-- DROP INDEX IF EXISTS public.idx_subscriptions_user_status_active;
-- DROP INDEX IF EXISTS public.idx_subscriptions_user_starts;
-- ALTER TABLE public.subscriptions DROP CONSTRAINT IF EXISTS uq_subscriptions_gateway_payment;
-- ALTER TABLE public.subscriptions DROP CONSTRAINT IF EXISTS subscriptions_gateway_check;
-- ALTER TABLE public.subscriptions DROP CONSTRAINT IF EXISTS subscriptions_status_check;
-- ALTER TABLE public.subscriptions DROP COLUMN IF EXISTS payment_id;
-- ALTER TABLE public.subscriptions DROP COLUMN IF EXISTS gateway;
-- ALTER TABLE public.subscriptions DROP COLUMN IF EXISTS status;
-- DROP TABLE IF EXISTS public.subscriptions;
-- DROP INDEX IF EXISTS public.idx_app_settings_value;
-- DROP TABLE IF EXISTS public.app_settings;
