-- =============================================================================
-- 002_learning_data.sql
-- learning_data: 사용자가 업로드/수집한 학습용 글 데이터
-- 목적: AI 글 생성 시 '내 스타일 학습' 소스로 사용할 컨텐츠 저장소.
-- 참조: ARCHITECTURE.md §learning_data
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.learning_data (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content_json  JSONB NOT NULL,            -- 본문, 구조화 필드(제목/본문/이미지 등)
  keywords      TEXT[] DEFAULT '{}',        -- 추출된 키워드 배열
  meta          JSONB DEFAULT '{}'::jsonb,  -- 출처 URL, SEO 점수, 통계 등 부가정보
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 사용자별 최신순 조회 최적화 (가장 자주 쓰이는 쿼리 패턴)
CREATE INDEX IF NOT EXISTS idx_learning_data_user_created
  ON public.learning_data(user_id, created_at DESC);

-- 키워드 검색 최적화 (text[] 배열 검색)
CREATE INDEX IF NOT EXISTS idx_learning_data_keywords
  ON public.learning_data USING GIN (keywords);

-- JSONB 메타 필드 검색 최적화 (선택적 필터)
CREATE INDEX IF NOT EXISTS idx_learning_data_meta
  ON public.learning_data USING GIN (meta);

-- ROLLBACK:
-- DROP INDEX IF EXISTS public.idx_learning_data_meta;
-- DROP INDEX IF EXISTS public.idx_learning_data_keywords;
-- DROP INDEX IF EXISTS public.idx_learning_data_user_created;
-- DROP TABLE IF EXISTS public.learning_data;
