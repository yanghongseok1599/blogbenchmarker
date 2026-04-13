# QA 체크리스트 — Phase 1.2 (DB 마이그레이션 / Supabase 스키마 + RLS)

> 검증 대상: `supabase/migrations/20260413_001_users.sql` ~ `006_rls.sql`, 관련 트리거·인덱스·정책.
> 실행 시점: Phase 1.2 완료 직후. 실제 실행은 별도 작업(본 문서는 초안).
> 우선순위: **BLOCKER**(배포 즉시 중단 사유) / **HIGH**(당일 수정) / **MEDIUM**(Phase 내 수정).
> 근거 스킬: `supabase-migration-rules`, `boundary-qa §3-3 ~ §4-1`.

---

## A. 마이그레이션 파일 구조 / 네이밍

- [ ] **[MEDIUM]** 파일명이 `YYYYMMDD_NNN_{purpose}.sql` 형식을 준수하는지 — `ls supabase/migrations/` 결과와 `ARCHITECTURE.md` 목록 비교.
- [ ] **[MEDIUM]** 번호 중복·점프 없는 연속 시퀀스인지 (001, 002, 003 …) — `ls | awk -F_ '{print $2}' | sort -u` 확인.
- [ ] **[MEDIUM]** 이미 적용된 마이그레이션 파일이 사후 수정되지 않았는지 — `git log --follow`로 히스토리 확인.
- [ ] **[MEDIUM]** 각 파일 하단에 `-- ROLLBACK:` 주석(역순 SQL)이 존재하는지 — `grep -L "ROLLBACK:" supabase/migrations/*.sql` 결과가 비어있어야 함.
- [ ] **[HIGH]** 모든 DDL이 idempotent (`CREATE TABLE IF NOT EXISTS`, `CREATE OR REPLACE FUNCTION`, `DROP POLICY IF EXISTS` 후 CREATE)인지 — `supabase db reset` 재실행 가정.
- [ ] **[MEDIUM]** `supabase/seed.sql`에 프로덕션 비밀정보(관리자 이메일·비밀번호 등) 없음 — `grep -E "password|admin@|service_role" supabase/seed.sql` 0건.

## B. 스키마 정합성 (컬럼·타입·제약)

- [ ] **[HIGH]** `profiles.id`가 `auth.users(id) ON DELETE CASCADE` FK로 설정되어 있는지 — auth.users 삭제 시 고아 row 방지.
- [ ] **[HIGH]** `plan` 컬럼의 `CHECK (plan IN ('free','pro','unlimited'))` 제약 존재 — enum 누락 시 잘못된 플랜 값 입력 가능.
- [ ] **[HIGH]** `subscriptions.status` CHECK 제약 (`'active','expired','refunded'`) 존재.
- [ ] **[BLOCKER]** `subscriptions`에 `UNIQUE(payment_provider, payment_id)` 제약 존재 — webhook 재시도·중복 호출 시 이중 결제 행 삽입 방지.
- [ ] **[HIGH]** `benchmark_blogs`에 `UNIQUE(user_id, blog_url)` 존재 — 즐겨찾기 중복 저장 방지.
- [ ] **[HIGH]** 모든 시간 컬럼이 `TIMESTAMPTZ`(timezone 포함)인지 — `TIMESTAMP`(naive) 사용 시 KST/UTC 혼선 발생.
- [ ] **[HIGH]** NOT NULL이 명시적으로 선언돼야 할 컬럼(`email`, `user_id`, `plan`, `is_active`, `is_admin`, `starts_at`, `expires_at`, `action`)이 NULL 허용되지 않는지.
- [ ] **[MEDIUM]** `profiles.email`에 UNIQUE 제약 + 인덱스 존재 (로그인 조회·중복 가입 차단).
- [ ] **[MEDIUM]** `profiles.updated_at` 자동 갱신 트리거(`moddatetime` 또는 커스텀) 존재 — 수동 갱신 누락 방지.
- [ ] **[MEDIUM]** 모든 PK가 UUID인 경우 `DEFAULT gen_random_uuid()` 지정 — 클라이언트가 id 생성하지 않도록.
- [ ] **[MEDIUM]** `app_settings`가 단일 행 강제 (`CHECK (id = 1)`) — 여러 설정 행 생성 방지.

## C. 인덱스 / 성능

- [ ] **[HIGH]** `learning_data(user_id, created_at DESC)` 복합 인덱스 존재 — 마이페이지 목록 쿼리 기본 패턴.
- [ ] **[HIGH]** `usage_logs(user_id, created_at DESC)` 복합 인덱스 존재 — 일일 사용량 집계 쿼리 성능.
- [ ] **[MEDIUM]** `benchmark_posts(benchmark_blog_id, posted_at DESC)` 인덱스 존재 — 벤치마킹 탭 정렬 조회.
- [ ] **[MEDIUM]** `subscriptions(user_id, status)` 인덱스 존재 — 활성 구독 조회용.
- [ ] **[MEDIUM]** `benchmark_blogs(user_id)` 인덱스(또는 UNIQUE 포함) 존재.
- [ ] **[LOW]** 사용되지 않는 중복 인덱스 없는지 — `SELECT * FROM pg_indexes WHERE schemaname='public'` 수작업 리뷰.

## D. RLS 활성화 (BLOCKER 범주)

- [ ] **[BLOCKER]** 모든 public 테이블에 `ENABLE ROW LEVEL SECURITY` — `SELECT tablename FROM pg_tables WHERE schemaname='public' AND rowsecurity=false` 빈 결과.
- [ ] **[BLOCKER]** RLS ENABLE된 각 테이블에 정책 1개 이상 — `pg_policies LEFT JOIN pg_tables` 쿼리(스킬 §3-4)로 0건 확인.
- [ ] **[BLOCKER]** `profiles`에 `FORCE ROW LEVEL SECURITY` 여부 결정 — service role 외에 우회 불가 필요 시.

## E. RLS 정책 내용 검증

- [ ] **[BLOCKER]** `is_admin` 판정이 **반드시 `profiles` 조회**(`EXISTS (SELECT 1 FROM profiles WHERE id=auth.uid() AND is_admin)`)로만 수행 — `grep -nE "auth\.email\(\)|auth\.jwt\(\) *->>" supabase/migrations/` 0건.
- [ ] **[BLOCKER]** `learning_data`, `benchmark_blogs`, `benchmark_posts`의 `USING` 절이 `auth.uid() = user_id` 형태로 본인 격리.
- [ ] **[HIGH]** `benchmark_posts`는 `benchmark_blogs`를 통해 간접 소유권 검증 (`EXISTS (SELECT 1 FROM benchmark_blogs WHERE id = benchmark_posts.benchmark_blog_id AND user_id = auth.uid())`) — 소유자 불일치 leak 방지.
- [ ] **[HIGH]** INSERT 정책은 `WITH CHECK` 절 사용 (USING 단독 금지) — `usage_logs`, `learning_data`, `benchmark_blogs` 모두.
- [ ] **[HIGH]** `usage_logs`는 클라이언트의 `UPDATE`/`DELETE` 정책 **없음** — 로그 위변조 방지.
- [ ] **[HIGH]** `subscriptions`는 일반 사용자에게 `SELECT`만, `INSERT/UPDATE`는 service role(webhook)만.
- [ ] **[HIGH]** `app_settings.SELECT`는 `USING (true)`, `UPDATE`는 관리자 전용 정책 존재.
- [ ] **[MEDIUM]** 정책명 중복 없음 (같은 테이블 내 동일 이름 policy 없는지) — `pg_policies`에서 중복 검사.
- [ ] **[MEDIUM]** 정책이 `FOR ALL` 대신 작업별 분리 가능한 곳은 분리(가독성·감사 용이성).

## F. 트리거 / 함수

- [ ] **[BLOCKER]** `handle_new_user()` 트리거가 `auth.users AFTER INSERT`에 등록되어 profiles 자동 생성하는지.
- [ ] **[BLOCKER]** 해당 함수가 `SECURITY DEFINER` + `SET search_path = public` 조합인지 — search_path 고정 없이 DEFINER만 쓰면 escalation 리스크.
- [ ] **[HIGH]** 트리거가 실패해도 회원가입 전체 트랜잭션이 롤백되는지 (또는 실패를 삼키는지) — 설계 의도 명시 확인.
- [ ] **[HIGH]** `language` 기본값 ('ko') 적용 로직 존재 — Supabase Auth 메타 `raw_user_meta_data->>'language'` fallback.
- [ ] **[MEDIUM]** `display_name` 없을 때 `split_part(email, '@', 1)` fallback 사용.
- [ ] **[MEDIUM]** `handle_new_user()`가 UNIQUE 위반(예: 재가입) 시 idempotent 처리 — `ON CONFLICT (id) DO NOTHING`.

## G. 관리자 경로 격리

- [ ] **[BLOCKER]** 관리자용 Edge Function `admin-actions`만 service role 사용 — 그 외 함수/정책은 service role 미사용.
- [ ] **[HIGH]** 관리자 정책이 본인 정책보다 **뒤에** 평가되지 않도록 `FOR ALL` 중첩 확인 — 두 정책이 OR로 합쳐지는 동작 검증.
- [ ] **[HIGH]** 관리자 판정 함수(`public.is_admin()`)를 별도 SQL function으로 추출해 재사용 — 정책 복제 시 불일치 방지.
- [ ] **[MEDIUM]** 관리자 작업 이력을 `usage_logs` 또는 별도 `admin_audit_logs`에 기록하는 설계 존재.

## H. PII / 암호화 정책

- [ ] **[HIGH]** `profiles.email`은 Supabase Auth의 `auth.users.email`과 **이중 저장** 상태 — 목적(조회 편의)이 명확한지 결정, 아니면 `auth.users`에서만 보관.
- [ ] **[MEDIUM]** `learning_data.content` / `benchmark_posts.content_summary`에 저장되는 블로그 원문 PII 검토 — 제3자 블로그 본문 장기 저장 시 저작권/프라이버시 정책 명시 필요.
- [ ] **[MEDIUM]** `subscriptions.payment_id`는 PG사 공개 ID인지(내부 결제 카드번호 아님) 확인 — 카드번호·CVC 절대 저장 금지.
- [ ] **[MEDIUM]** `usage_logs.details JSONB`에 민감 프롬프트·API 응답 전문 저장 여부 결정 — 기본은 메타데이터(길이·액션명)만.
- [ ] **[LOW]** GDPR/개인정보보호법 대응: `profiles` 삭제 시 연쇄 삭제 확인용 CASCADE 테스트 시나리오 문서화.

## I. 경계면 shape (DB ↔ Repository)

- [ ] **[HIGH]** `_workspace/backend_schema_changelog.md`(혹은 동등 문서)에 컬럼명·타입 기록 — repositories와 대조 근거.
- [ ] **[HIGH]** snake_case 컬럼 ↔ repository가 반환하는 필드명이 일관된 변환 규칙(그대로 유지 or camelCase 변환) 준수.
- [ ] **[MEDIUM]** `usage_logs.details` JSONB의 기대 키 목록이 문서에 정의 — 핸들러 파싱 오류 예방.

## J. 배포 / 운영

- [ ] **[MEDIUM]** `supabase db push` 명령이 README/문서에 기록.
- [ ] **[MEDIUM]** Staging → Production 순서로 배포할 수 있도록 마이그레이션이 분리돼 있는지 (destructive 변경 별도 파일).
- [ ] **[LOW]** `pg_stat_statements` 또는 Supabase dashboard 쿼리 모니터링 활성화 계획 명시.

---

**합계:** 52개 (BLOCKER 8 · HIGH 20 · MEDIUM 20 · LOW 4)

**검증 주의사항:**
- 위 항목은 실제 SQL 실행 및 Supabase 인스턴스 접속이 필요한 경우가 많다. 로컬 `supabase start`로 검증하거나 dry-run 가능 항목과 분리해 진행한다.
- 마이그레이션 파일 자체가 아직 작성되지 않은 경우, 본 체크리스트는 **작성 가이드**로도 활용 가능.
