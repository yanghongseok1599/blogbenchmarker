-- check-rls-enabled.sql
-- 목적: 실제 Supabase/Postgres 인스턴스에 연결된 상태에서
--       public 스키마의 모든 테이블이 RLS ENABLE 되어 있는지 확인한다.
-- 사용:
--   psql "$DATABASE_URL" -f _workspace/qa-scripts/check-rls-enabled.sql
--   또는 Supabase Dashboard > SQL Editor 에서 실행
-- 기대 결과: 두 쿼리 모두 빈 결과(0 row).
-- 근거: supabase-migration-rules §2-1, boundary-qa §3-3 §3-4

-- 1) RLS OFF 상태인 public 테이블 목록 (정상이면 0건)
SELECT
  schemaname,
  tablename,
  '❌ RLS DISABLED — ENABLE ROW LEVEL SECURITY 필요' AS issue
FROM pg_tables
WHERE schemaname = 'public'
  AND rowsecurity = false
ORDER BY tablename;

-- 2) RLS ON 이지만 정책이 0개인 테이블 (정상이면 0건)
--    정책 없이 RLS ON 이면 모든 row 접근이 차단되어 사용 불가
SELECT
  t.schemaname,
  t.tablename,
  '⚠️ RLS ON, 정책 0개 — 모든 접근이 차단됨. 정책 추가 필요' AS issue
FROM pg_tables t
LEFT JOIN pg_policies p
  ON p.schemaname = t.schemaname
 AND p.tablename = t.tablename
WHERE t.schemaname = 'public'
  AND t.rowsecurity = true
GROUP BY t.schemaname, t.tablename
HAVING COUNT(p.polname) = 0
ORDER BY t.tablename;
