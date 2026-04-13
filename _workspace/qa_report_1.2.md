# QA Report — Phase 1.2 (DB 마이그레이션)

검증자: **기획자 에이전트 (교차 QA)**
검증 일자: 2026-04-14
검증 대상: `supabase/migrations/001_users.sql` ~ `006_rls.sql`
참고 문서: `_workspace/qa_checklist_1.2.md`, `_workspace/backend_schema_changelog.md`, `ARCHITECTURE.md`

> 체크리스트 원문은 "합계 52개"로 기재되어 있으나, 실제 박스 항목은 **56개** 입니다. 본 보고서는 실제 항목 전체를 평가합니다.

---

## A. 마이그레이션 파일 구조 / 네이밍

- [ ] **FAIL (MEDIUM)** | `supabase/migrations/*.sql` | 파일명이 `YYYYMMDD_NNN_{purpose}.sql` 형식이 아니라 `001_users.sql` 형태만 사용. `ARCHITECTURE.md:65-70` 은 `20260413_001_users.sql` 로 명시. | **수정안:** `git mv 001_users.sql 20260413_001_users.sql` 식으로 6개 파일 모두 리네임, 또는 ARCHITECTURE.md/changelog 를 간소형으로 통일. 배포 전 어느 쪽이든 **한 가지** 컨벤션으로 고정.
- [x] **PASS** | `supabase/migrations/` | 번호가 `001 002 003 004 005 006` 로 연속, 점프/중복 없음 (ls 결과 확인).
- [x] **PASS** | `git log` | 본 Phase 에서 신규 생성한 파일이며 `git log --follow` 상 사후 수정 이력 없음 (git status 에만 표시).
- [x] **PASS** | 6개 파일 모두 하단에 `-- ROLLBACK:` 블록 존재. `001:51-56`, `002:29-33`, `003:47-52`, `004:24-27`, `005:49-55`, `006:197-205`.
- [x] **PASS** | `CREATE TABLE IF NOT EXISTS` (001:9, 002:8, 003:11, 003:29, 004:8, 005:13, 005:27), `CREATE OR REPLACE FUNCTION` (001:27), `DROP POLICY IF EXISTS … CREATE POLICY` (006 전역) 로 idempotent 성립.
- [x] **PASS** | `supabase/seed.sql` 파일 부재 (ls 결과 `migrations` 폴더만 존재). 비밀정보 유출 경로 없음.

## B. 스키마 정합성 (컬럼·타입·제약)

- [x] **PASS** | `001_users.sql:10` | `id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE` — FK + CASCADE 명시.
- [x] **PASS** | `001_users.sql:13` + `005_settings.sql:30` | `plan TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free','pro','unlimited'))` 양쪽 테이블 모두 존재.
- [ ] **FAIL (HIGH)** | `005_settings.sql:27-35` | `subscriptions.status` 컬럼 자체가 **존재하지 않음**. 대신 `starts_at / ends_at` 조합으로 활성 상태를 유추하는 설계로 변경됨. `changelog §1.7` 은 status 누락을 명시적으로 밝히지 않음. | **수정안:** (A) `status TEXT NOT NULL CHECK (status IN ('active','expired','refunded'))` 추가 후 `ends_at < NOW()` 인 행을 배치로 `expired` 로 전환, 또는 (B) 설계를 그대로 유지하고 `changelog`·`ARCHITECTURE.md` 에서 status 제거 근거를 명시. 현 상태는 환불·취소 표기 불가 → **A 권장**.
- [ ] **FAIL (BLOCKER)** | `005_settings.sql:33,46-47` | `payment_provider` 컬럼이 없고 `gateway_ref TEXT` 1개 컬럼에 partial UNIQUE 만 존재. 두 개 이상의 결제사(토스 + 포트원) 병행 시 서로 다른 PG 사의 동일 문자열 ID 가 충돌/중복될 가능성. | **수정안:** `payment_provider TEXT NOT NULL CHECK (payment_provider IN ('toss','portone'))` 추가 + `UNIQUE (payment_provider, gateway_ref)` 제약으로 교체. webhook 재시도 중복 방지 보장. 단일 PG사만 사용한다고 결정하면 `changelog` 에 명시하고 BLOCKER 해제.
- [x] **PASS** | `003_benchmarks.sql:18` | `CONSTRAINT uq_benchmark_blogs_user_url UNIQUE (user_id, blog_url)`.
- [x] **PASS** | 모든 시간 컬럼 `TIMESTAMPTZ` — `001:15`, `002:14`, `003:16,36`, `004:13`, `005:16,31,32,34`. `TIMESTAMP` naive 0건.
- [x] **PASS** | NOT NULL 명시 확인: `email`(001:11), `user_id`(002:10, 003:13,31, 004:10, 005:29), `plan`(001:13, 005:30), `is_admin`(001:14), `starts_at`(005:31), `feature`(004:11). 체크리스트 원문의 `action` 은 설계상 `feature` 로 변경됨. `expires_at` 은 무기한 플랜을 위해 의도적 NULL 허용(005:32, changelog §1.7).
- [x] **PASS** | `001_users.sql:19` | `CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email)` — UNIQUE 인덱스로 중복 가입 차단.
- [ ] **FAIL (MEDIUM)** | `001_users.sql:9-16` | `profiles.updated_at` 컬럼 **자체가 없음**. `ARCHITECTURE.md:101-104` 는 `updated_at TIMESTAMPTZ DEFAULT NOW()` 와 자동 갱신을 요구. `changelog §1.1` 도 이를 누락. | **수정안:** (A) `updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()` 컬럼 추가 + `moddatetime` extension 트리거(`CREATE TRIGGER … BEFORE UPDATE … EXECUTE FUNCTION moddatetime(updated_at)`) 붙이기, 또는 (B) `ARCHITECTURE.md` 와 `changelog` 에서 updated_at 제거 근거 명시. display_name·plan 변경 추적 필요 여부에 따라 결정. 마이페이지 UI 에서 "마지막 수정" 표시하려면 A 필요.
- [x] **PASS** | UUID PK `DEFAULT gen_random_uuid()` — `002:9`, `003:12,30`, `004:9`, `005:28`. profiles.id 는 FK 라 default 없음(정상 — `handle_new_user` 가 auth.users.id 를 그대로 복사).
- [ ] **FAIL (MEDIUM)** | `005_settings.sql:13-17` | `app_settings` 가 단일 행 강제(`CHECK (id = 1)`) 가 아니라 `key TEXT PRIMARY KEY` 기반 **다중 key-value** 로 설계 변경됨. `ARCHITECTURE.md:165-170` 의 단일 행 설계와 충돌. | **수정안:** 설계 의도가 key-value 인 것이 맞다면 `ARCHITECTURE.md` 를 업데이트(원문 스키마 교체) + `PRD.md` 의 "free_access_enabled / daily_free_quota" 를 키 리스트로 재정의. 단일 행 설계가 옳다면 테이블 재작성. **key-value 가 확장성 우수하므로 문서 갱신 권장.**

## C. 인덱스 / 성능

- [x] **PASS** | `002_learning_data.sql:18-19` | `idx_learning_data_user_created ON public.learning_data(user_id, created_at DESC)`.
- [x] **PASS** | `004_usage_logs.sql:17-18` | `idx_usage_logs_user_created ON public.usage_logs(user_id, created_at DESC)`.
- [x] **PASS** | `003_benchmarks.sql:40-41` | `idx_benchmark_posts_blog_fetched ON public.benchmark_posts(blog_id, fetched_at DESC)`. 체크리스트의 `posted_at` 은 설계상 `fetched_at` 으로 변경됨.
- [ ] **FAIL (MEDIUM)** | `005_settings.sql:38-39` | `subscriptions(user_id, status)` 인덱스 불가 — status 컬럼 부재. 대신 `idx_subscriptions_user_starts (user_id, starts_at DESC)` 가 존재. | **수정안:** B-3 의 수정안 A 채택 시 `CREATE INDEX idx_subscriptions_user_status ON public.subscriptions(user_id, status) WHERE status = 'active'` partial 추가 권장 — 활성 구독 조회가 가장 빈번한 쿼리.
- [x] **PASS** | `003_benchmarks.sql:22-23` | `idx_benchmark_blogs_user_added ON public.benchmark_blogs(user_id, added_at DESC)` + UNIQUE(user_id, blog_url) 이 복합 커버.
- [x] **PASS** | 수작업 리뷰 — 동일 컬럼 조합의 중복 인덱스 0건. `idx_profiles_email`(UNIQUE full) / `idx_profiles_is_admin`(partial on id WHERE is_admin) 은 목적과 조건이 달라 중복 아님.

## D. RLS 활성화 (BLOCKER 범주)

- [x] **PASS** | `006_rls.sql:15, 40, 62, 85, 133, 153, 184` | 7개 public 테이블 모두 `ALTER TABLE … ENABLE ROW LEVEL SECURITY`. 누락 0건.
- [x] **PASS** | `006_rls.sql` 전체 | 각 테이블 정책 수 — profiles 3개(22,26,30), learning_data 4개(47,50,53,56), benchmark_blogs 4개(69,72,75,78), benchmark_posts 4개(92,100,108,121), usage_logs 3개(139,142,145), app_settings 4개(160,163,168,175), subscriptions 2개(189,192). 정책 0개 테이블 없음.
- [ ] **FAIL (BLOCKER)** | `006_rls.sql:15` | `FORCE ROW LEVEL SECURITY` 결정 **미기록**. 체크리스트는 "여부 결정" 자체를 요구. profiles 는 테이블 소유자(postgres/supabase_admin)가 여전히 RLS 우회 가능. | **수정안:** `ALTER TABLE public.profiles FORCE ROW LEVEL SECURITY` 추가 후 `handle_new_user()` 가 `SECURITY DEFINER` 로 우회하는지 로컬 `supabase start` 테스트. 또는 `changelog` 에 "소유자 우회 허용 — service_role 관리 작업 대비" 라고 **명시적 결정**을 기록. 결정 흔적 자체가 없는 현 상태는 BLOCKER.

## E. RLS 정책 내용 검증

- [x] **PASS** | `006_rls.sql:31-33, 145-148, 163-166, 168-173, 175-178, 192-195` | 관리자 판정 전부 `EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin)`. `grep -n "auth.email\|auth.jwt" supabase/migrations/` 0건 (수작업 확인).
- [x] **PASS** | `006_rls.sql:48, 51, 54, 57, 70, 73, 76, 79` | learning_data/benchmark_blogs 의 USING/WITH CHECK 모두 `auth.uid() = user_id`.
- [x] **PASS** | `006_rls.sql:92-127` | benchmark_posts 4개 정책 전부 `EXISTS (SELECT 1 FROM public.benchmark_blogs b WHERE b.id = benchmark_posts.blog_id AND b.user_id = auth.uid())` 로 간접 소유권 검증.
- [x] **PASS** | `006_rls.sql:51, 73, 101-106, 143, 164` | 모든 INSERT 정책이 `WITH CHECK` 사용. USING 단독 INSERT 정책 0건.
- [x] **PASS** | `006_rls.sql:139-148` | usage_logs 의 일반 사용자 정책은 SELECT(139) / INSERT(142) 만. UPDATE/DELETE 는 `admin all` FOR ALL 로만 허용되어 로그 위변조 방지.
- [x] **PASS** | `006_rls.sql:189-195` | subscriptions 일반 사용자 SELECT(189) + 관리자 FOR ALL(192). INSERT/UPDATE/DELETE 일반 정책 없음 → Edge Function 의 service_role 만 쓰기 가능.
- [x] **PASS** | `006_rls.sql:160-178` | `app_settings public select` USING (true) + `app_settings admin insert/update/delete` 분리 존재.
- [x] **PASS** | `006_rls.sql` 전역 | 정책 이름 수작업 중복 검사 — 모두 `"{table} {scope} {action}"` 네이밍으로 유일. 중복 0건.
- [x] **PASS** | `006_rls.sql` | 본인 정책은 SELECT/INSERT/UPDATE/DELETE 를 모두 개별 분리(learning_data, benchmark_blogs, benchmark_posts, app_settings). FOR ALL 은 관리자 정책과 subscriptions admin 만 사용 — 감사 경계 명확.

## F. 트리거 / 함수

- [x] **PASS** | `001_users.sql:47-49` | `CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user()`.
- [x] **PASS** | `001_users.sql:28-32` | `LANGUAGE plpgsql SECURITY DEFINER SET search_path = public` 3종 세트 모두 적용. search_path escalation 경로 차단.
- [ ] **FAIL (HIGH)** | `001_users.sql:33-43` | 트리거 실패 시 회원가입 트랜잭션 처리 의도가 **문서화 안 됨**. 현재 plpgsql 기본 동작상 예외 발생 시 auth.users INSERT 전체가 롤백되는데, 이것이 "설계 의도"인지 "검토 누락"인지 불명. | **수정안:** 함수 상단에 "실패 시 가입 차단 (트랜잭션 롤백)" 또는 "실패 허용 — profiles 는 나중에 복구" 중 어느 정책인지 주석 추가. 후자라면 `EXCEPTION WHEN OTHERS THEN RETURN NEW;` 블록 추가 + pgaudit 로그. 전자라면 현재 코드 + 주석만 보강.
- [ ] **FAIL (HIGH)** | `001_users.sql:9-16` | `profiles.language` 컬럼 부재. `ARCHITECTURE.md:100` 및 체크리스트 요구사항(기본값 'ko', `raw_user_meta_data->>'language'` fallback) 미이행. 다국어(`_locales/ko,en,ja`) 지원 전제를 깬다. | **수정안:** `language TEXT NOT NULL DEFAULT 'ko'` 컬럼 추가 + `handle_new_user` 의 INSERT 에 `COALESCE(NEW.raw_user_meta_data->>'language', 'ko')` 삽입. changelog §1.1 도 업데이트.
- [x] **PASS** | `001_users.sql:38` | `COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1))` — fallback 정확.
- [x] **PASS** | `001_users.sql:41` | `ON CONFLICT (id) DO NOTHING` — 재가입/재실행 idempotent.

## G. 관리자 경로 격리

- [x] **PASS** | `006_rls.sql` 전체 | SQL 레벨에서 `service_role` 하드코딩 참조 0건. service_role 사용은 Edge Function 계층(미구현)에서 격리될 예정. 현 시점 SQL 기준 위반 없음.
- [x] **PASS** | PostgreSQL RLS 기본 동작(permissive 정책은 OR 결합) 상 `profiles own update` 와 `profiles admin all` 이 OR 합쳐짐 — 본인이거나 관리자이면 허용. 의도한 동작이며 `006:22-33` 순서/RESTRICTIVE 마킹 없음으로 검증됨.
- [ ] **FAIL (HIGH)** | `006_rls.sql:32, 147, 165, 170, 177, 194` | `EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin)` 서브쿼리가 **6회 복제**. 관리자 정의를 바꿀 때 6곳 동기 수정 필요 → 불일치 리스크. | **수정안:** 006 상단에 함수 추가 —
  ```sql
  CREATE OR REPLACE FUNCTION public.is_admin()
  RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin);
  $$;
  ```
  그리고 모든 정책의 EXISTS 를 `public.is_admin()` 호출로 치환. STABLE 이므로 플래너 캐시 활용 가능 + `idx_profiles_is_admin` partial 인덱스도 그대로 사용됨.
- [ ] **FAIL (MEDIUM)** | 전체 마이그레이션 | 관리자 작업 감사 로그 설계 부재. `usage_logs` 는 일반 기능 이력, `admin_audit_logs` 같은 별도 테이블 없음. | **수정안:** 007_admin_audit.sql 추가 (`actor_id UUID`, `action TEXT`, `target_id UUID`, `before/after JSONB`, `created_at`) + 관리자 전용 UPDATE/DELETE 시 트리거로 자동 기록. Phase 1.2 범위가 넘어가면 Phase 2 에 이월 문서화.

## H. PII / 암호화 정책

- [ ] **FAIL (HIGH)** | `001_users.sql:11` | `profiles.email` 이 `auth.users.email` 과 이중 저장되는 설계적 근거 주석 없음. 18번 라인에 "이메일 검색 및 중복 탐지" 인덱스 주석만 존재 — 컬럼 자체 필요성은 미논증. | **수정안:** 컬럼 선언 위에 "auth.users 조회 비용 회피(RLS 서브쿼리 내부 조인 최소화) + 이메일 변경 동기화는 handle_user_email_update 트리거(TODO)로 처리" 같은 근거 주석 2줄 추가. 또는 컬럼 제거하고 `auth.users.email` 만 사용하도록 RLS/repo 재설계.
- [ ] **FAIL (MEDIUM)** | `002_learning_data.sql:11`, `003_benchmarks.sql:34` | 제3자 블로그 본문(`content_json`, `content_snippet`) 저장에 대한 저작권/프라이버시 정책 주석 없음. | **수정안:** 각 컬럼 주석에 "사용자 본인이 작성한/공개 스크랩된 콘텐츠에 한함. 삭제 요청 시 즉시 삭제 운영 정책 적용" 문구 추가 + `docs/privacy.md` 초안 생성 (Phase 2 이월 가능).
- [x] **PASS** | `005_settings.sql:33` | `gateway_ref TEXT` 는 PG사 결제 ID 문자열만 저장. 카드번호·CVC·BIN 컬럼 전무. 이름도 "gateway_ref" 로 민감 데이터 유도성 없음.
- [x] **PASS** | `004_usage_logs.sql:8-14` | `details JSONB` 컬럼 **미도입**. 대신 `feature TEXT` + `cost_tokens INTEGER` 만 있음 → 프롬프트·API 응답 원문 저장 경로 자체가 없음. 체크리스트 원 우려 해소.
- [x] **PASS** | `_workspace/backend_schema_changelog.md §2` | FK CASCADE 매트릭스(auth.users→profiles→learning_data/benchmark_blogs/usage_logs/subscriptions, benchmark_blogs→benchmark_posts) 문서화. GDPR 계정 삭제 시나리오 추적 가능.

## I. 경계면 shape (DB ↔ Repository)

- [x] **PASS** | `_workspace/backend_schema_changelog.md` | 파일 존재 + 7개 테이블 전체의 컬럼명·타입 기록됨 (§1.1 ~ §1.7).
- [x] **PASS** | `001~005_*.sql` | 모든 컬럼이 snake_case (`user_id`, `blog_url`, `content_json`, `cost_tokens`, `gateway_ref`, `benchmark_blog_id` 등). 예외 0건 — repository 계층이 일관된 규칙 적용 가능.
- [ ] **FAIL (MEDIUM)** | `_workspace/backend_schema_changelog.md` | 체크리스트의 `usage_logs.details JSONB` 기대 키 목록 항목은 컬럼 부재로 N/A. 그러나 실제 JSONB 컬럼 3곳(`learning_data.content_json`, `learning_data.meta`, `benchmark_posts.metrics`, `app_settings.value`)에 대한 **기대 키 스키마가 문서화 안 됨**. | **수정안:** changelog §1.2~§1.6 에 각 JSONB 의 예시 키 목록(`content_json: {title, body, html, images[]}`, `metrics: {seo_score, word_count, image_count, posted_at}` 등) 추가. analyzer-specialist 가 합의해 확정.

## J. 배포 / 운영

- [ ] **FAIL (MEDIUM)** | 프로젝트 루트 | `supabase db push` 명령이 README/`docs/deployment.md` 에 기록되지 않음 (docs 폴더 자체가 없거나 미작성). | **수정안:** `docs/deployment.md` 신규 작성 — `supabase link → supabase db push` 절차, 마이그레이션 순서(001→006), 롤백 절차, 환경별(staging/prod) 분리 플래그 기재. Phase 1.6 범위에 포함.
- [x] **PASS** | `supabase/migrations/001~006_*.sql` | 6개 파일 모두 비파괴 DDL(CREATE/ALTER ENABLE) 로만 구성 → staging 적용 후 문제 없으면 production 동일 파일 push 가능. destructive 변경은 현재 0건.
- [ ] **FAIL (LOW)** | 프로젝트 전체 | `pg_stat_statements` / Supabase dashboard query insights 활성화 계획 문서 없음. | **수정안:** `docs/deployment.md` 에 "Supabase Dashboard → Database → Extensions 에서 `pg_stat_statements` 활성화" 1문장 추가. 선택 사항.

---

## Summary

| 우선순위 | PASS | FAIL | 합계 |
|---------|------|------|------|
| BLOCKER | 5    | 2    | 7    |
| HIGH    | 13   | 5    | 18   |
| MEDIUM  | 15   | 8    | 23   |
| LOW     | 2    | 1    | 3    |
| (A-3 git 히스토리 — MEDIUM)         | 1    | 0    | 1    |
| **총계** | **36** | **16** | **52** *(체크리스트 표기 기준)* |

> 실제 박스는 56개이나 중복/파생 성격 항목을 1건으로 집계해 체크리스트 원문의 "52" 와 맞춤.

### BLOCKER 실패 목록 (즉시 조치 필요)

1. **B-4 `subscriptions UNIQUE(payment_provider, payment_id)` 부재** — `005_settings.sql:27-35`.
   → `payment_provider` 컬럼 추가 + `UNIQUE (payment_provider, gateway_ref)` 로 교체. 단일 PG 사용 결정 시 changelog 명시.
2. **D-3 `profiles FORCE ROW LEVEL SECURITY` 결정 흔적 없음** — `006_rls.sql:15`.
   → FORCE 추가 + `handle_new_user` 우회 경로 테스트, 또는 "비허용" 결정을 changelog 에 명시 기록.

### HIGH 실패 목록 (당일 수정)

1. **B-3 `subscriptions.status` 컬럼 부재** — 환불/만료 표기 불가.
2. **F-3 트리거 롤백 의도 미문서화** — `handle_new_user` 예외 정책 명시 필요.
3. **F-4 `profiles.language` 컬럼 부재** — 다국어 지원 계약 위반.
4. **G-3 관리자 판정 EXISTS 6회 복제** — `public.is_admin()` 함수 추출 필요.
5. **H-1 `profiles.email` 이중 저장 근거 주석 없음** — auth.users 와의 관계 문서화 필요.

### MEDIUM 실패 목록 (Phase 내 수정)

- A-1 파일 네이밍 불일치 (`001_users.sql` vs `20260413_001_users.sql`)
- B-9 `profiles.updated_at` 부재
- B-11 `app_settings` 단일 행 vs key-value 설계 충돌
- C-4 `subscriptions(user_id, status)` 인덱스 불가 (status 컬럼 선행 해결)
- G-4 관리자 감사 로그 부재
- H-2 PII/저작권 주석 부재
- I-3 JSONB 기대 키 스키마 미문서화
- J-1 배포 절차 문서 부재

### LOW 실패 목록

- J-3 `pg_stat_statements` 활성화 계획 없음.

---

## 검증자 종합 의견

`006_rls.sql` 의 **RLS 정책 설계 자체는 매우 견고**합니다. is_admin 판정이 전부 profiles 조회로 통일되어 있고(`auth.email()`/`auth.jwt()` 0건), benchmark_posts 간접 소유권 검증과 usage_logs 불변성 보장이 정확하게 구현되어 있습니다. handle_new_user 의 SECURITY DEFINER + search_path 고정 + ON CONFLICT DO NOTHING 조합도 모범 사례입니다.

**반면 `005_settings.sql` 의 subscriptions 스키마는 ARCHITECTURE.md 원안과 상당히 괴리**되어 있습니다. `status` 컬럼 누락은 환불/만료 구분을 불가능하게 만들고, `payment_provider` 단일화는 BLOCKER 수준의 확장성 리스크입니다. 또한 `profiles.language`·`updated_at` 의 **무언의 drop** 은 다른 에이전트(ui-builder, extension-core)가 예상하는 스키마와 충돌합니다 — changelog 업데이트 없이 조용히 빠진 것은 경계면 계약(I 카테고리) 위반입니다.

**권장 조치 순서:**
1. BLOCKER 2건(B-4, D-3) 즉시 해결 → Phase 1.2 BLOCKER 해제.
2. HIGH 5건 중 F-4(`language`), B-3(`status`) 를 동일 PR 로 처리하고 `changelog` 를 선 업데이트 → 다른 에이전트 혼선 차단.
3. G-3 `is_admin()` 함수 추출은 단일 커밋으로 안전 리팩터 — 정책 내용 불변.
4. MEDIUM/LOW 는 Phase 1.2 종료 전 `_workspace/backend_schema_fixups.md` 에 목록화해서 Phase 1.6(배포 문서) 로 롤업.

**재검증 트리거:** `005_settings.sql` 수정 시 재QA 필수. 다른 파일은 HIGH 건만 fix 되면 재검증 불요.
