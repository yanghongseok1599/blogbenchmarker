# Backend Schema Changelog — Phase 1.2

> 다른 에이전트(extension-core, ui-builder, analyzer-specialist, security-qa)가 참조하는 **DB 계약서**.
> 스키마가 바뀌면 반드시 이 문서를 먼저 업데이트한 뒤 마이그레이션을 작성한다.

작성일: 2026-04-13
마이그레이션 범위: `supabase/migrations/001_users.sql` ~ `006_rls.sql`

---

## 1. 테이블 요약

### 1.1 `public.profiles` — 001_users.sql
`auth.users` 1:1 확장. **유일하게 FK의 루트가 되는 테이블.**

| 컬럼 | 타입 | 제약 |
|------|------|------|
| `id` | UUID | PK, FK `auth.users(id)` ON DELETE CASCADE |
| `email` | TEXT | NOT NULL, UNIQUE 인덱스. `auth.users.email` 과 이중 저장(조인 회피 목적 — 001_users.sql 주석 참조) |
| `display_name` | TEXT | 기본값: email의 '@' 앞부분 |
| `plan` | TEXT | NOT NULL, DEFAULT `'free'`, CHECK (`free`/`pro`/`unlimited`) |
| `is_admin` | BOOLEAN | NOT NULL, DEFAULT `false` |
| `language` | TEXT | NOT NULL, DEFAULT `'ko'`. 다국어 UI(`_locales/ko,en,ja`). 가입 시 `raw_user_meta_data->>'language'` fallback |
| `created_at` | TIMESTAMPTZ | NOT NULL, DEFAULT `NOW()` |
| `updated_at` | TIMESTAMPTZ | NOT NULL, DEFAULT `NOW()`. `trg_profiles_set_updated_at` 트리거로 UPDATE 시 자동 갱신 |

**인덱스:**
- `idx_profiles_email` (UNIQUE)
- `idx_profiles_is_admin` (partial: `WHERE is_admin = true`) — `is_admin_user()` 함수에서 사용

**트리거:**
- `on_auth_user_created` AFTER INSERT ON `auth.users` → `handle_new_user()` (SECURITY DEFINER + `search_path=public`).
  - **실패 정책:** 예외 발생 시 트랜잭션 롤백 → 회원가입 차단 (의도됨 — 반쪽 가입 방지).
- `trg_profiles_set_updated_at` BEFORE UPDATE → `set_updated_at()` 가 `updated_at=NOW()` 자동 갱신.

---

### 1.2 `public.learning_data` — 002_learning_data.sql
AI 글 생성의 '내 스타일 학습' 소스.

| 컬럼 | 타입 | 제약 |
|------|------|------|
| `id` | UUID | PK, DEFAULT `gen_random_uuid()` |
| `user_id` | UUID | NOT NULL, FK `profiles(id)` ON DELETE CASCADE |
| `content_json` | JSONB | NOT NULL |
| `keywords` | TEXT[] | DEFAULT `{}` |
| `meta` | JSONB | DEFAULT `{}` |
| `created_at` | TIMESTAMPTZ | NOT NULL, DEFAULT `NOW()` |

**인덱스:** `(user_id, created_at DESC)`, GIN on `keywords`, GIN on `meta`.

---

### 1.3 `public.benchmark_blogs` — 003_benchmarks.sql
경쟁 블로그 즐겨찾기.

| 컬럼 | 타입 | 제약 |
|------|------|------|
| `id` | UUID | PK, DEFAULT `gen_random_uuid()` |
| `user_id` | UUID | NOT NULL, FK `profiles(id)` ON DELETE CASCADE |
| `blog_url` | TEXT | NOT NULL |
| `blog_name` | TEXT | NULL 허용 |
| `added_at` | TIMESTAMPTZ | NOT NULL, DEFAULT `NOW()` |

**제약:** `UNIQUE (user_id, blog_url)` — 동일 사용자 중복 등록 방지.
**인덱스:** `(user_id, added_at DESC)`.

---

### 1.4 `public.benchmark_posts` — 003_benchmarks.sql
벤치마킹 글 캐시.

| 컬럼 | 타입 | 제약 |
|------|------|------|
| `id` | UUID | PK, DEFAULT `gen_random_uuid()` |
| `blog_id` | UUID | NOT NULL, FK `benchmark_blogs(id)` ON DELETE CASCADE |
| `post_url` | TEXT | NOT NULL, **UNIQUE (전역)** |
| `title` | TEXT | NULL 허용 |
| `content_snippet` | TEXT | NULL 허용 |
| `metrics` | JSONB | DEFAULT `{}` |
| `fetched_at` | TIMESTAMPTZ | NOT NULL, DEFAULT `NOW()` |

**인덱스:** `(blog_id, fetched_at DESC)`, GIN on `metrics`.

> 참고: `benchmark_posts` 에는 `user_id` 컬럼이 없다. RLS 는 `blog_id → benchmark_blogs.user_id` 로 간접 검증한다.

---

### 1.5 `public.usage_logs` — 004_usage_logs.sql
유료 기능 호출 이력 (일일 쿼터 검증용).

| 컬럼 | 타입 | 제약 |
|------|------|------|
| `id` | UUID | PK, DEFAULT `gen_random_uuid()` |
| `user_id` | UUID | NOT NULL, FK `profiles(id)` ON DELETE CASCADE |
| `feature` | TEXT | NOT NULL (예: `generate_content`, `analyze_seo`) |
| `cost_tokens` | INTEGER | NOT NULL, DEFAULT `0` |
| `created_at` | TIMESTAMPTZ | NOT NULL, DEFAULT `NOW()` |

**인덱스:** `(user_id, created_at DESC)`, `(feature, created_at DESC)`.

---

### 1.6 `public.app_settings` — 005_settings.sql
key-value 전역 설정.

| 컬럼 | 타입 | 제약 |
|------|------|------|
| `key` | TEXT | PK |
| `value` | JSONB | NOT NULL |
| `updated_at` | TIMESTAMPTZ | NOT NULL, DEFAULT `NOW()` |

**인덱스:** GIN on `value`.
**예상 키:** `free_access_enabled`, `daily_free_quota`, `feature_flags`, `maintenance_mode` 등.

---

### 1.7 `public.subscriptions` — 005_settings.sql
결제 성공 이력 (Edge Function `verify-subscription` 이 쓰기).

| 컬럼 | 타입 | 제약 |
|------|------|------|
| `id` | UUID | PK, DEFAULT `gen_random_uuid()` |
| `user_id` | UUID | NOT NULL, FK `profiles(id)` ON DELETE CASCADE |
| `plan` | TEXT | NOT NULL, CHECK (`free`/`pro`/`unlimited`) |
| `status` | TEXT | NOT NULL, DEFAULT `'active'`, CHECK (`active`/`cancelled`/`expired`/`refunded`) |
| `starts_at` | TIMESTAMPTZ | NOT NULL, DEFAULT `NOW()` |
| `ends_at` | TIMESTAMPTZ | NULL 허용 (무기한 플랜) |
| `gateway` | TEXT | CHECK (`toss`/`portone`). NULL 허용(레거시/내부 부여) |
| `payment_id` | TEXT | gateway 내부 결제 ID. webhook 재시도 키 |
| `created_at` | TIMESTAMPTZ | NOT NULL, DEFAULT `NOW()` |

**제약:** `UNIQUE (gateway, payment_id)` — 복합 UNIQUE 로 다중 PG사 네임스페이스 충돌 방지.

**인덱스:**
- `idx_subscriptions_user_starts` `(user_id, starts_at DESC)`
- `idx_subscriptions_user_status_active` `(user_id, status) WHERE status = 'active'` — 활성 구독 조회(가장 빈번)
- `idx_subscriptions_ends_at` `ends_at WHERE ends_at IS NOT NULL AND status = 'active'` — 만료 배치용

**status 전이:**
- `active` → `cancelled` (해지 예약, `ends_at` 까지 혜택 유지)
- `active` → `expired` (cron 배치: `ends_at < NOW()` 인 active 전환)
- `active`/`cancelled` → `refunded` (환불 webhook 수신 시, 혜택 즉시 회수)

---

## 2. FK Cascade 정책 요약

| Child | Parent | ON DELETE |
|-------|--------|-----------|
| profiles.id | auth.users.id | CASCADE |
| learning_data.user_id | profiles.id | CASCADE |
| benchmark_blogs.user_id | profiles.id | CASCADE |
| benchmark_posts.blog_id | benchmark_blogs.id | CASCADE |
| usage_logs.user_id | profiles.id | CASCADE |
| subscriptions.user_id | profiles.id | CASCADE |

> 결과: `auth.users` 1건 삭제 → 해당 유저의 모든 파생 데이터가 자동 정리 (GDPR 대응).

---

## 3. RLS 정책 매트릭스 — 006_rls.sql

모든 테이블 `ENABLE ROW LEVEL SECURITY`. 관리자 판정은 **항상** `EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin)`.

| 테이블 | SELECT | INSERT | UPDATE | DELETE | 관리자 |
|--------|--------|--------|--------|--------|--------|
| profiles | 본인 | (트리거 전용) | 본인 | — | 전권 (FOR ALL) |
| learning_data | 본인 | 본인 | 본인 | 본인 | — |
| benchmark_blogs | 본인 | 본인 | 본인 | 본인 | — |
| benchmark_posts | blog 소유자 | blog 소유자 | blog 소유자 | blog 소유자 | — |
| usage_logs | 본인 | 본인 | — (불변) | — (불변) | 전권 (FOR ALL) |
| app_settings | **공개 (true)** | 관리자 | 관리자 | 관리자 | — |
| subscriptions | 본인 | — (service_role) | — (service_role) | — (service_role) | 전권 (FOR ALL) |

**주의사항:**
- `profiles` INSERT 정책은 **없다**. 생성은 오직 `handle_new_user()` 트리거(SECURITY DEFINER)로만.
- `usage_logs` UPDATE/DELETE 정책은 일반 사용자에겐 없다(이력 위변조 방지). 관리자만 가능.
- `subscriptions` 쓰기는 Edge Function(`verify-subscription`)이 service_role 로만 수행. 일반 정책 없음.
- `benchmark_posts` 는 `user_id` 컬럼이 없으므로 `blog_id → benchmark_blogs.user_id` 서브쿼리로 소유권 확인.

---

## 4. 다른 에이전트용 계약(Contract) 요약

**extension-core / ui-builder 가 알아야 할 것:**
- 쿼리는 모두 `auth.uid()` 기반 — JWT 미첨부 요청은 0행 반환.
- INSERT 시 `user_id` 필드를 반드시 `auth.uid()` 값으로 지정해야 WITH CHECK 통과.
- `profiles` 는 회원가입 직후 자동 생성되므로 클라이언트에서 직접 INSERT 금지.

**analyzer-specialist 가 알아야 할 것:**
- `learning_data.content_json` / `benchmark_posts.metrics` 는 JSONB 자유 스키마. 필드 컨벤션 합의 필요.
- 대량 조회 시 `(user_id, created_at DESC)` 또는 `(blog_id, fetched_at DESC)` 인덱스를 활용하는 쿼리 작성.

**security-qa 가 검증할 것:**
- `pg_tables WHERE schemaname='public' AND rowsecurity=false` → 결과 0건이어야 함.
- 정책 내 `auth.email()` / `auth.jwt()->>'role'` 직접 사용 없는지 확인.
- `gateway_ref` UNIQUE partial 인덱스로 웹훅 중복 처리 방지되는지 점검.

---

## 5. 변경 이력

| 날짜 | 마이그레이션 | 내용 |
|------|-------------|------|
| 2026-04-13 | 001 ~ 006 | Phase 1.2 초기 스키마 + RLS 일괄 생성 |
| 2026-04-14 | 001, 005, 006 | QA 리포트 1.2 의 BLOCKER 2 + HIGH 5 해소 (아래 §6 diff 참조) |

---

## 6. Diff — 2026-04-14 (QA 1.2 수정)

### 6.1 `001_users.sql`
- **+ `profiles.language TEXT NOT NULL DEFAULT 'ko'`** (QA F-4)
  - `handle_new_user()` 에서 `COALESCE(NEW.raw_user_meta_data->>'language', 'ko')` fallback 삽입.
- **+ `profiles.updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`** (QA B-9 / 관련 HIGH)
  - `set_updated_at()` plpgsql 함수 + `trg_profiles_set_updated_at` BEFORE UPDATE 트리거 신설.
  - moddatetime 확장 의존 없음(확장 관리 비용 최소화).
- **+ email 이중 저장 근거 주석** (QA H-1): auth.users 조인 회피, 원자적 조회.
- **+ handle_new_user 실패 정책 주석** (QA F-3): 예외 시 트랜잭션 롤백 = 회원가입 차단(의도).
- **+ 기존 배포 idempotent 패치 구간**: `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` 2줄.

### 6.2 `005_settings.sql`
- **+ `subscriptions.status TEXT NOT NULL DEFAULT 'active'`** (QA B-3)
  - CHECK `(active|cancelled|expired|refunded)`.
- **- `subscriptions.gateway_ref TEXT`** → **+ `subscriptions.gateway TEXT` + `subscriptions.payment_id TEXT`** (QA B-4 BLOCKER)
  - `gateway` CHECK `(toss|portone)` — 다중 PG사 지원.
  - 복합 `UNIQUE (gateway, payment_id)` 로 단일 네임스페이스 충돌 방지.
- **- 단일 `idx_subscriptions_gateway_ref` UNIQUE** → 복합 UNIQUE 제약으로 대체.
- **+ `idx_subscriptions_user_status_active` partial** (QA C-4 / B-3): 활성 구독 조회 최적화.
- **+ `idx_subscriptions_ends_at` 조건 강화**: `WHERE ends_at IS NOT NULL AND status = 'active'`.
- **+ 기존 배포 idempotent 패치 구간**: DO 블록으로 `gateway_ref → payment_id` RENAME, `ADD COLUMN IF NOT EXISTS`, CHECK/UNIQUE 제약 조건부 추가.

### 6.3 `006_rls.sql`
- **+ `public.is_admin_user(uid UUID DEFAULT auth.uid())` SQL 함수** (QA G-3)
  - `STABLE SECURITY DEFINER SET search_path = public` — 플래너 캐시 + 정책 재귀 회피.
  - `GRANT EXECUTE ... TO anon, authenticated` 로 RLS 정책 내부 호출 허용.
- **관리자 판정 EXISTS 6회 복제 → `public.is_admin_user()` 호출로 일괄 치환** (QA G-3)
  - 영향 정책: `profiles admin all`, `usage_logs admin all`, `app_settings admin insert/update/delete`, `subscriptions admin all`.
- **+ FORCE RLS 결정 주석** (QA D-3 BLOCKER): 미적용 결정 근거 명시(트리거 SECURITY DEFINER 호환 + service_role 관리 작업 허용).

### 6.4 영향 평가
- **backward-compat:** 기존에 이미 `001~006` 을 적용한 환경이 있다면 001/005 상단의 `ALTER TABLE ... IF NOT EXISTS` + DO 블록으로 자동 패치됨.
- **Repository 계층(Phase 1.3 예정):**
  - `user-repo` — `language`, `updated_at` 필드 select/update 추가.
  - `subscription-repo` — `status` 필드 기반 활성 구독 판정으로 변경(`where status='active' and (ends_at is null or ends_at > now())`).
  - `gateway_ref` 를 참조하는 코드가 있다면 `payment_id` 로 이름 치환.
- **RLS 정책 내용 불변:** is_admin_user() 는 기존 EXISTS 와 동치. 권한 경계 변경 없음.
