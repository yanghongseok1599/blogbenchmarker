-- =============================================================================
-- 004_usage_logs.sql
-- usage_logs: 기능 호출 및 토큰 사용량 로그 (쿼터 검증/과금 근거)
-- 목적: AI 생성 등 유료 기능 호출 이력을 남겨 일일 쿼터 검증과 사용량 분석에 사용.
-- 참조: ARCHITECTURE.md §usage_logs, §사용량 체크 흐름
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.usage_logs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  feature      TEXT NOT NULL,                    -- 예: 'generate_content', 'analyze_seo'
  cost_tokens  INTEGER NOT NULL DEFAULT 0,       -- Gemini 토큰 소비량
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 쿼터 계산 핵심 쿼리: 특정 사용자의 최근 N시간 로그 count
CREATE INDEX IF NOT EXISTS idx_usage_logs_user_created
  ON public.usage_logs(user_id, created_at DESC);

-- 기능별 집계 쿼리 최적화 (관리자 대시보드용)
CREATE INDEX IF NOT EXISTS idx_usage_logs_feature_created
  ON public.usage_logs(feature, created_at DESC);

-- ROLLBACK:
-- DROP INDEX IF EXISTS public.idx_usage_logs_feature_created;
-- DROP INDEX IF EXISTS public.idx_usage_logs_user_created;
-- DROP TABLE IF EXISTS public.usage_logs;
