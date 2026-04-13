# Architecture Audit — 원안 vs 실제 구현

> `ARCHITECTURE.md` (설계 문서) 와 실제 코드베이스의 차이. 주요 결정 변경은 근거·영향 범위와 함께 기록.
> 감사일: 2026-04-14
> 결정의 최종 소스: 본 문서 + `_workspace/backend_schema_changelog.md` + `_workspace/edge_function_contracts.md`.

---

## 0. 요약

**전체적으로 원안 충실 구현.** 변경은 모두 **실제 요구사항 대응** 이며 문서에 근거 기록됨.

| 영역 | 원안 일치도 | 주요 diff |
|------|-------------|----------|
| 폴더 구조 | 95% 일치 | `admin/`, `payments/`, `sidepanel/tools/`, `sidepanel/components/`, `background/collectors/`, `background/schedulers/` **추가** |
| DB 스키마 | 80% 일치 | `subscriptions` 재설계 · `app_settings` 단일→key-value · `profiles.language/updated_at` 추가 · migration 007/008 **추가** |
| RLS | 99% 일치 | `is_admin_user()` SQL 함수로 EXISTS DRY (의미 동일) |
| Edge Functions | 100% 일치 + 확장 | `_shared/` 로 공통화, `toss.ts`/`portone.ts`/`webhook-sig.ts` 추가 |
| Realtime | 부분 구현 | benchmark_blogs 구독 — 코드 레벨 재확인 필요 |
| 메시지 라우팅 | 일치 | handler 맵 패턴 준수 (switch 안티패턴 회피) |
| 인증 흐름 | 일치 | chrome.storage custom adapter, autoRefreshToken, 로그아웃 정리 패턴 |

---

## 1. 폴더 구조 — 추가된 영역

**원안에 없었으나 신설된 디렉토리:**

| 경로 | Phase | 사유 |
|------|-------|------|
| `extension/admin/` + `tabs/{users,settings,banwords,audit}.js` | 11 | ARCHITECTURE.md 는 관리자 페이지를 언급만 했고 구조 명시 없음. 탭 분리로 유지보수성 확보. |
| `extension/payments/` | 8.2 | 결제 페이지가 별도 html/js 필요. |
| `extension/sidepanel/tools/{char-counter,pomodoro,forbidden-words,screenshot}.js` | 9 | PRD 에는 있으나 ARCHITECTURE.md 에는 구체 파일 명세 없음. |
| `extension/sidepanel/components/*.js` | 3~9 | 재사용 UI 조각 9개. 탭별 중복 방지. |
| `extension/sidepanel/tabs/{learning,mypage,tools,youtube}-tab.*` | 6/7/8.1/9 | ARCHITECTURE.md 는 analyze/benchmark/generate/settings 4탭만 언급. |
| `extension/background/collectors/{naver-rss-collector,naver-html-scraper}.js` | 4.2 | 자동 수집을 한 파일로 몰아넣지 않고 전략별 분리. |
| `extension/background/schedulers/benchmark-sync.js` | 4.2 | `chrome.alarms` 주기 작업 격리. |
| `extension/content/screenshot-overlay.js` | 9 | 캡처 오버레이. |
| `extension/content/analyzer-bridge.js` | 3.2 | sidepanel ↔ content 메시지 브릿지. |
| `supabase/functions/_shared/*` 8개 | 5.1~8.2 | 원안은 Edge Function 별 자체 구현. 공통화로 중복 제거. |
| `supabase/functions/admin-actions/` | 11 | ARCHITECTURE.md 에 존재. 구현 완료. |
| `supabase/functions/verify-subscription/` | 8.2 | ARCHITECTURE.md 에 존재. 구현 완료. |
| `extension/_locales/{ko,en,ja}/` | 10 | ARCHITECTURE.md 에 멘션만. 실제 파일 신설. |
| `extension/lib/utils/` (i18n/stats/url-parser/clipboard) | 10 + 다수 | 원안은 dom-safe/clipboard/i18n 만. stats/url-parser 추가. |
| `_workspace/` 32+ 문서 | 전 Phase | 에이전트 간 계약/QA 저장소. |

**영향:** 원안 대비 파일 수 대략 2배. 책임 분리 원칙 따라 정당화됨.

---

## 2. DB 스키마 — 주요 변경

### 2.1 `subscriptions` 재설계 (BLOCKER 해소)

| 필드 | 원안 | 실제 | 변경 이유 |
|------|------|------|----------|
| `payment_provider` | TEXT | **삭제** → `gateway` (CHECK `toss`/`portone`) | 다중 PG사 지원 명확화 |
| `payment_id` | TEXT | `payment_id` TEXT | 원안 유지 |
| UNIQUE | `(payment_provider, payment_id)` | **`(gateway, payment_id)`** 복합 | webhook 중복 INSERT 방지 + 네임스페이스 분리 |
| `status` | TEXT CHECK (`active`/`expired`/`refunded`) | TEXT CHECK (`active`/`cancelled`/`expired`/`refunded`) | `cancelled` 추가 — "해지 예약(ends_at 까지 혜택 유지)" 상태 |
| `starts_at` / `expires_at` | NOT NULL TIMESTAMPTZ | `starts_at` NOT NULL, `ends_at` NULL 허용 | 무기한(unlimited) 플랜 대응 |

**근거:** `qa_report_1.2.md` B-3/B-4 BLOCKER 해소. `_workspace/backend_schema_changelog.md` §6.2 참조.

**영향 범위:**
- `supabase/functions/verify-subscription/index.ts` — INSERT 시 `gateway`+`payment_id`+`status` 지정
- `supabase/functions/_shared/{toss,portone}.ts` — 결제 검증 응답을 이 필드들에 매핑
- `extension/lib/repositories/subscription-repo.js` — 활성 구독 판정 `status='active' AND (ends_at IS NULL OR ends_at > NOW())`

### 2.2 `app_settings` — 단일 행 → key-value

| 항목 | 원안 | 실제 |
|------|------|------|
| PK | `id INTEGER CHECK (id=1)` | `key TEXT PRIMARY KEY` |
| value | 고정 컬럼 (`free_access_enabled`, `daily_free_quota`) | `value JSONB` 자유 스키마 |

**근거:** 확장성. 새 설정 추가 시 마이그레이션 없이 row INSERT. `qa_report_1.2.md` B-11.
**영향 범위:** `extension/admin/tabs/settings.js`, `extension/lib/repositories/admin-repo.js` (key 리스트 정의 필요).

### 2.3 `profiles` — 컬럼 확장

| 추가 | 사유 |
|------|-----|
| `language TEXT NOT NULL DEFAULT 'ko'` | Phase 10 다국어. `handle_new_user` 에서 `raw_user_meta_data->>'language'` fallback |
| `updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()` | 마이페이지 "마지막 수정" 표시. `trg_profiles_set_updated_at` BEFORE UPDATE 트리거로 자동 갱신 |

원안 ARCHITECTURE.md 스니펫에 이미 `language`/`updated_at` 기재 있었으나 Phase 1.2 초기 마이그레이션에서 누락 → QA 에서 발견 → Phase 1.2 수정 라운드에 추가 (`001_users.sql`).

### 2.4 신설 마이그레이션 — 007/008

**원안 migrations: 001~006 (6개).** 실제 8개.

| 추가 | 내용 | 근거 |
|------|------|------|
| `007_payment_triggers.sql` | `plan_rank()`, `compute_effective_plan()`, `refresh_user_plan()`, `trg_subscriptions_sync_plan`, `expire_due_subscriptions()` | Phase 8.2 결제 자동 동기화. `boundary-qa §4-4` 요구사항 "profiles.plan 업데이트 트랜잭션 원자성" 이행. |
| `008_admin_audit.sql` | `admin_audit_logs` + 관리자 변경 트리거 | Phase 11. `qa_report_1.2.md` G-4 MEDIUM 해소 (관리자 감사 로그). |

### 2.5 RLS — `is_admin_user(uid)` 함수 추출

**원안:** 각 테이블 정책에 `EXISTS (SELECT 1 FROM profiles WHERE id=auth.uid() AND is_admin)` 복제.
**실제:** `006_rls.sql` 에 `public.is_admin_user(uid UUID DEFAULT auth.uid())` SECURITY DEFINER + STABLE 함수 추출. 모든 정책이 이 함수 호출.

**근거:** `qa_report_1.2.md` G-3 HIGH — "관리자 판정 EXISTS 6회 복제" DRY. 의미 동일.

---

## 3. Edge Functions — 추가 / 변경

### 3.1 `_shared/` 공통화 (원안에 명시 없음)

| 파일 | 책임 |
|------|-----|
| `_shared/auth.ts` | 4개 Edge Function 공통 JWT 검증 + profiles 조회 |
| `_shared/usage.ts` | 쿼터 정책 단일 소스 (`DAILY_QUOTA_BY_PLAN`, `MINUTE_LIMIT`) |
| `_shared/gemini.ts` | Gemini 호출 + 프롬프트 주입 방어 fence |
| `_shared/youtube.ts` | 자막 fetch (공개 API 직접) |
| `_shared/blog-transform.ts` | 자막 → 블로그 변환 (Gemini) |
| `_shared/toss.ts` / `portone.ts` | PG사 API 래퍼 |
| `_shared/webhook-sig.ts` | 결제 webhook 서명 검증 |

**근거:** 동일 에러 분류 / 쿼터 정책 / CORS 를 4개 함수에 중복 구현하는 대신 공통화.

### 3.2 쿼터 정책 상세화

**원안 ARCHITECTURE.md:** "플랜별 quota 비교" 1줄.
**실제:**
- 1분 하드 리밋 10회 (DoS 방지, plan 무관)
- 1일 쿼터: free=3 / pro=100 / unlimited=∞ / is_admin=∞
- rolling 24h window (자정 리셋 아님)

**근거:** PRD 플랜 정책 반영. `edge_function_contracts.md §1.4 / §2.4`.

---

## 4. 인증 흐름 — 원안 충실 구현

| 체크포인트 | 상태 |
|----------|------|
| chrome.storage custom adapter | ✅ `supabase-client.js` |
| autoRefreshToken: true | ✅ (SDK 기본) |
| 수동 JWT 갱신 로직 0건 | ✅ REFERENCE.md §4-1 버그 재현 방지 |
| signOut 후 storage clear + 자동 재로그인 방지 플래그 | ✅ `handlers/auth-handler.js` |
| OAuth `chrome.identity.launchWebAuthFlow` | ✅ |
| OAuth state 검증 | ✅ (QA 2.1 해소) |
| 이메일/비밀번호 + Google OAuth | ✅ |

---

## 5. 메시지 라우팅 — switch 안티패턴 회피

**원안 REFERENCE.md §10:** "기존 service-worker.js 의 50+ case switch 는 안티패턴".
**실제:** `background/handlers/index.js` 가 `action → handler` 맵 등록. 각 handler 는 독립 파일 (one handler per file).

---

## 6. 분석기 — 구현 강화

**원안:**
- seo-analyzer / nlp-utils / hook-detector 언급

**실제:**
- 위 3개 + `learning-context.js` (학습 데이터 → 프롬프트 컨텍스트) 추가
- `hook-detector.js` 는 REFERENCE.md §4-4 버그 (false positive) 재현 방지를 위해 **최소 2개 조건 충족** 규칙 + confidence 점수 (0~1)
- 순수 함수. DOM / chrome API 의존 0. 단위 테스트 가능 (테스트는 P1).

---

## 7. 사이드패널 — 탭 / 컴포넌트 분리

**원안:** 4개 탭 (analyze/benchmark/generate/settings).
**실제:** 8개 탭 — analyze/benchmark/generate/learning/mypage/tools/youtube + settings 는 mypage 병합.

**컴포넌트 분리:** score-card/progress-bar/comparison-card/bar-chart/word-cloud/generate-result-card/learning-card/usage-gauge/expiry-banner — 재사용. innerHTML 0건 준수.

---

## 8. 보안 경계 — 전면 준수

- API 키 하드코딩 0건 (Deno.env / env-config.js)
- innerHTML 0건 (dom-safe.js + textContent/createElement)
- RLS 전 테이블 ENABLE (service_role 예외: verify-subscription, admin-actions)
- is_admin 판정: `profiles.is_admin` 만 (이메일 비교 / JWT 클레임 파싱 0건)
- 프롬프트 주입 방어: fence + sanitize + 시스템 메타 지시 무시 규칙

---

## 9. 남은 gap (ARCHITECTURE.md 명시 but 미확인)

| 항목 | 상태 |
|------|------|
| benchmark_blogs Realtime 구독 | 코드 레벨 확인 필요 (P1-5) |
| profiles.plan 필드 Realtime 구독 (결제 완료 시 즉시 반영) | 미확인 |
| `docs/deployment.md` / `docs/privacy.md` | 미작성 (P0-3, P0-5) |
| ES Module 번들링 (MV3 제약) | 미착수 (P0-2) |

---

## 10. 결정 기록 원칙

향후 스키마/아키텍처 변경 시 본 문서 + `_workspace/backend_schema_changelog.md` 에 반드시 기록:

1. **변경 전/후 diff**
2. **근거 문서** (QA 리포트 / PRD / 외부 요구사항)
3. **영향 범위** (repository / Edge Function / UI / migration)
4. **rollback 절차** (필요 시)

---

## 변경 이력

| 날짜 | 변경 |
|------|------|
| 2026-04-14 | 초판 — 통합 감사 기준 |
