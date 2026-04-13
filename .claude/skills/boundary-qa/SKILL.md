---
name: boundary-qa
description: BLOG BenchMarker Phase 완료 직후·배포 전 품질 검증 시 반드시 사용. "QA", "경계면 검증", "통합 검증", "shape 일치", "QA 리포트", "RLS 테스트", "JWT 검증", "API 키 노출 검사", "Phase 완료 검증", "incremental QA"가 언급되면 로드한다. 후속 트리거: "QA 다시 돌려", "재검증", "배포 전 점검". 존재 확인이 아닌 "경계면 교차 비교"와 incremental 실행 원칙을 제공한다.
---

# Boundary QA — 경계면 교차 비교 기반 검증

## 이 스킬이 전달하는 것

`security-qa` 에이전트와 자체 검증이 필요한 다른 에이전트가 공통으로 사용하는 **통합 정합성 검증 방법론**. 개별 파일이 존재하는가가 아니라 **경계면에서 shape과 계약이 일치하는가**를 본다.

## 1. QA의 본질 — 경계면 교차 비교

### 1-1. "존재 확인"은 QA가 아니다
`ls extension/background/handlers/auth-handler.js` 같은 체크는 빌드 검증이지 QA가 아니다.

QA의 진짜 가치는 경계면에서의 불일치를 찾는 것이다. 경계면이란:

- **Edge Function 응답** ↔ **repository 파싱** — 필드명·타입 매칭
- **repository 반환** ↔ **handler 포워딩** — 구조 유지
- **handler 응답** ↔ **UI 렌더** — 옵셔널 처리, 기본값
- **DB 스키마** ↔ **TypeScript/JSDoc 타입** — NOT NULL·DEFAULT 일치
- **Manifest 권한** ↔ **실제 코드 사용 API** — 과다/과소 여부
- **테이블 RLS 정책** ↔ **프론트 접근 패턴** — 거부되는 패턴 실제 시도하는지

### 1-2. 경계면 검증 = 양쪽 동시 읽기
한 면만 읽고 "괜찮다"고 판단하지 말고, 경계의 양쪽 파일을 **동시에 열어 필드명·타입·필수여부를 대조**한다.

예:
```
[Edge Function 응답]          [프론트 파싱]
{ seoScore: 78 }       vs     post.seo_score  → 불일치 BUG
{ score: 78 }          vs     post.seoScore   → 불일치 BUG
{ seoScore: 78 }       vs     post.seoScore   → 통과
```

## 2. Incremental 실행 원칙

### 2-1. 전체 완성 후 1회 감사 금지
이유: 경계면 버그는 쌓일수록 원인 추적 비용이 폭증. Phase 7에서 발견된 버그가 Phase 3에서 만든 shape 문제라면, 그 사이 쌓인 모든 코드가 영향 범위.

### 2-2. Phase별 실행
각 Phase 완료 직후 **해당 Phase 범위만** 검증. 이전 Phase는 이미 통과한 것으로 간주(단, 이번 Phase가 이전 shape를 변경하면 재검증).

### 2-3. 트리거 조건
- 한 Phase의 모든 작업이 `[x]` 마킹됨
- `_workspace/` 공유 문서에 변경 발생
- 사용자가 "QA 돌려" 명시 요청

## 3. 공통 체크리스트 (모든 Phase 공통)

### 3-1. API 키 하드코딩
```bash
grep -rE "AIza[0-9A-Za-z_-]{30,}|sk_live|sk_test_live|service_role|GEMINI_API_KEY\s*=\s*['\"]" extension/
```
**기대:** 0건. 발견 시 BLOCKER.

### 3-2. innerHTML 사용
```bash
grep -rn "innerHTML\s*=" extension/
```
**기대:** 0건. 발견 시 BLOCKER (dom-safe.js 경유 교체).

### 3-3. RLS 활성화
```sql
SELECT tablename FROM pg_tables
WHERE schemaname='public' AND rowsecurity=false;
```
**기대:** 빈 결과. 발견 시 BLOCKER.

### 3-4. 정책 누락 (RLS ON이지만 policy 0개)
```sql
SELECT t.tablename
FROM pg_tables t
LEFT JOIN pg_policies p ON p.schemaname=t.schemaname AND p.tablename=t.tablename
WHERE t.schemaname='public' AND t.rowsecurity=true
GROUP BY t.tablename
HAVING COUNT(p.polname)=0;
```
**기대:** 빈 결과.

### 3-5. Manifest 권한 과다
manifest.json의 `permissions`·`host_permissions`를 나열 → 코드에서 실제 사용하는 chrome API와 매칭. 사용 안 하는 권한은 제거 대상.

### 3-6. 경계면 shape 매칭
`_workspace/backend_schema_changelog.md`와 `_workspace/handler_api.md`를 대조:
- 테이블 컬럼명 ↔ repository 메서드 반환 필드명
- Edge Function 응답 키 ↔ handler 응답 키 ↔ UI 렌더 참조 키

## 4. Phase별 심화 체크

### 4-1. Phase 1.2 (DB 스키마)
- [ ] 모든 public 테이블 RLS ENABLE
- [ ] 본인 접근 정책 최소 1개 존재
- [ ] is_admin 정책이 `profiles` 참조 (이메일 비교 금지)
- [ ] profiles 자동 생성 트리거 존재 (회원가입 시 동작 확인)
- [ ] 마이그레이션 파일 순서 충돌 없음

### 4-2. Phase 2.2 (Auth)
- [ ] `signOut()` 후 `chrome.storage.local.clear()` + `chrome.storage.sync.clear()` 호출
- [ ] `onAuthStateChanged` 리스너가 로그아웃 플래그 체크
- [ ] Supabase client가 custom storage adapter 사용
- [ ] 세션 만료 시 자동 갱신 작동 (SDK 기본 동작 확인)

### 4-3. Phase 5.1 (Gemini Edge Function)
- [ ] 첫 단계 `Authorization` 헤더 검증
- [ ] `createClient`에 `global.headers.Authorization` 전달 (RLS 자동 적용)
- [ ] 사용량 체크가 Gemini 호출 **전**
- [ ] `GEMINI_API_KEY`는 `Deno.env.get()`에서만 읽음
- [ ] 로그에 API 키·토큰 출력 없음 (`grep "console.log.*apiKey" functions/`)
- [ ] CORS OPTIONS 핸들링 존재

### 4-4. Phase 8.2 (결제 webhook)
- [ ] webhook 서명 검증 코드 존재 (금액·플랜 위변조 방지)
- [ ] subscriptions INSERT는 service role (일반 RLS 우회 목적)
- [ ] 결제 webhook은 JWT 검증 불필요 (인증 사용자 없음), 대신 서명 검증
- [ ] 결제 성공 시 profiles.plan 업데이트 트랜잭션 원자성

## 5. 발견 분류 체계

| 등급 | 정의 | 예시 | 대응 |
|---|---|---|---|
| **BLOCKER** | 배포 즉시 중단 필요 | API 키 노출, XSS 취약, RLS 누락, 결제 위변조 가능 | 같은 날 긴급 수정 |
| **HIGH** | 당일 수정 | 경계면 shape 불일치, 권한 과다, 로그아웃 정리 누락 | 다음 작업 진행 전 수정 |
| **MEDIUM** | Phase 내 수정 | 로깅 과다, 에러 메시지 부정확, 미사용 코드 | Phase 완료 전 처리 |
| **LOW** | 백로그 | 네이밍 일관성, 주석 누락 | 별도 이슈로 관리 |

## 6. QA 리포트 형식

출력 경로: `_workspace/qa_report_{phase}.md`

```markdown
# QA Report — Phase 1.2 (DB Schema)

검사일: 2026-04-14
검사 범위:
- supabase/migrations/20260413_001_users.sql
- supabase/migrations/20260413_002_learning_data.sql
- ... (전체 목록)

## 체크포인트 결과

| 항목 | 결과 | 증거 |
|---|---|---|
| API 키 하드코딩 | PASS | `grep -rE "AIza\|sk_live..." supabase/` 0건 |
| 모든 테이블 RLS ENABLE | PASS | `pg_tables` 조회 결과 비어있음 |
| is_admin 이메일 비교 | PASS | `grep -n "auth.email" migrations/` 0건 |
| profiles 자동 생성 트리거 | PASS | `20260413_001_users.sql:35-52` 확인 |
| 정책 누락 | PASS | 모든 테이블에 정책 1개 이상 |

## 발견 사항

### BLOCKER (0건)
없음

### HIGH (1건)
- [H-1] `subscriptions` 테이블의 `payment_id` 중복 방지 UNIQUE 제약 누락
  - 재현: 같은 payment_id로 webhook 두 번 들어오면 중복 row
  - 권장 수정: `UNIQUE(payment_provider, payment_id)` 추가

### MEDIUM (0건)
### LOW (0건)

## 미검사 항목
- 실제 SQL 실행 통한 RLS 우회 테스트: Supabase 프로젝트 미배포 상태이므로 로컬 Postgres에서 시뮬레이션 필요 — 배포 후 재검사 예정

## 다음 단계 권장
HIGH [H-1] 수정 후 Phase 1.3 진행.
```

## 7. "이상 없음" 금지 규칙

결과가 모두 PASS여도 **체크포인트별 증거를 반드시 나열**한다.
- 이유 1: 나중에 "그때 무엇을 검사했는가"를 추적 가능
- 이유 2: QA 대상에서 누락된 항목을 명시적으로 "미검사"로 기록해야 책임 경계가 명확

리포트에 "이상 없음"만 쓴 경우, 어떤 항목도 실제로 검사하지 않은 것과 구별 불가능해진다.

## 8. 검증 스크립트 자동화

반복되는 검사는 `_workspace/qa-scripts/`에 번들링:
- `qa-scripts/check-hardcoded-keys.sh`
- `qa-scripts/check-innerHTML.sh`
- `qa-scripts/check-rls.sql`
- `qa-scripts/check-policies.sql`

security-qa 에이전트가 매 Phase 실행 시 이 스크립트들을 먼저 돌리고, Phase별 심화 체크를 추가.

## 9. WHY

- **왜 incremental QA인가:** 경계면 버그는 누적되면서 원인 추적이 기하급수적으로 어려워진다. Phase 직후 잡으면 수정은 로컬이고, 이후 코드는 올바른 가정에서 쌓인다.
- **왜 shape 비교가 핵심인가:** 실제 프로덕션 버그의 상당수가 "필드명 불일치", "옵셔널/필수 어긋남", "snake_case ↔ camelCase 변환 누락"에서 발생한다. 존재 확인만으로는 잡히지 않는다.
- **왜 증거를 남기는가:** 무엇을 검사했는지 문서화해야, 놓친 것을 추후에라도 보완할 수 있다. 통과/실패보다 검사 범위가 더 중요한 정보.

## 10. 참고 스킬

- 확장프로그램 보안 규칙: `chrome-extension-security`
- Supabase RLS·Edge Function 규칙: `supabase-migration-rules`
- 기존 코드 버그 목록: `legacy-port-guide`
