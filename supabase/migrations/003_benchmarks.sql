-- =============================================================================
-- 003_benchmarks.sql
-- benchmark_blogs + benchmark_posts: 경쟁 블로그 즐겨찾기 및 글 캐시
-- 목적: 사용자가 지정한 경쟁 블로그와 그 글들을 저장해 벤치마킹 분석에 사용.
-- 참조: ARCHITECTURE.md §benchmark_blogs, §benchmark_posts
-- =============================================================================

-- -----------------------------------------------------------------------------
-- benchmark_blogs: 사용자가 즐겨찾기한 경쟁 블로그
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.benchmark_blogs (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  blog_url   TEXT NOT NULL,
  blog_name  TEXT,
  added_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- 같은 사용자가 같은 블로그를 중복 등록하지 못하도록 방지
  CONSTRAINT uq_benchmark_blogs_user_url UNIQUE (user_id, blog_url)
);

-- 사용자별 목록 조회 최적화
CREATE INDEX IF NOT EXISTS idx_benchmark_blogs_user_added
  ON public.benchmark_blogs(user_id, added_at DESC);

-- -----------------------------------------------------------------------------
-- benchmark_posts: 경쟁 블로그에서 수집한 글 스냅샷(캐시)
-- blog_id가 삭제되면 연관 글도 함께 삭제 (CASCADE)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.benchmark_posts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  blog_id         UUID NOT NULL REFERENCES public.benchmark_blogs(id) ON DELETE CASCADE,
  post_url        TEXT NOT NULL UNIQUE,         -- 전역 유니크: 같은 URL은 한 번만 저장
  title           TEXT,
  content_snippet TEXT,                         -- 본문 요약(일부) — 전문 저장은 별도 설계
  metrics         JSONB DEFAULT '{}'::jsonb,    -- seo_score, word_count, image_count 등
  fetched_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- blog_id로 포스트 목록 조회 최적화
CREATE INDEX IF NOT EXISTS idx_benchmark_posts_blog_fetched
  ON public.benchmark_posts(blog_id, fetched_at DESC);

-- metrics JSONB 검색 최적화
CREATE INDEX IF NOT EXISTS idx_benchmark_posts_metrics
  ON public.benchmark_posts USING GIN (metrics);

-- ROLLBACK:
-- DROP INDEX IF EXISTS public.idx_benchmark_posts_metrics;
-- DROP INDEX IF EXISTS public.idx_benchmark_posts_blog_fetched;
-- DROP TABLE IF EXISTS public.benchmark_posts;
-- DROP INDEX IF EXISTS public.idx_benchmark_blogs_user_added;
-- DROP TABLE IF EXISTS public.benchmark_blogs;
