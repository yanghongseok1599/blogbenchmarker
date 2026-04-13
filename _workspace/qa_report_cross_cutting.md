# QA 횡단 자동화 — 산출 보고

> 작성일: 2026-04-14
> 작성자: security-qa 에이전트(검수자)
> 산출 위치: `_workspace/qa-scripts/`
> 근거: `_workspace/qa_master_report.md §3`, `.claude/skills/boundary-qa/SKILL.md §8`

---

## 1. 산출 파일 (총 8개)

| # | 파일 | 종류 | 권한 | 역할 |
|--:|---|---|---|---|
| 1 | `check-hardcoded-keys.sh` | bash | 0755 | API 키·시크릿 하드코딩 0건 검사 |
| 2 | `check-dom-unsafe.sh` | bash | 0755 | XSS/CSP 위험 DOM API 0건 검사 |
| 3 | `check-rls-enabled.sh` | bash | 0755 | 마이그레이션 정적 파싱으로 RLS ENABLE 누락 검사 |
| 3' | `check-rls-enabled.sql` | SQL | 0644 | 실제 DB 연결 시 RLS·정책 누락 SELECT (보조) |
| 4 | `check-email-admin.sh` | bash | 0755 | 이메일 비교 기반 관리자 판정 패턴 0건 검사 |
| 5 | `check-sw-async-return.sh` | bash | 0755 | Service Worker 비동기 응답 시 `return true` 존재 검사 |
| ─ | `run-all.sh` | bash | 0755 | 5종 순차 실행 + 종합 리포트, 하나라도 실패 시 exit 1 |
| ─ | `README.md` | md | 0644 | 각 스크립트 목적·실행법·종료코드·한계 문서화 |

요청 범위(횡단 BLOCKER 5종 + run-all + README) 충족.

---

## 2. 스크립트별 동작 요약

### 1) check-hardcoded-keys.sh
- **검사 대상:** `extension/`, `supabase/`
- **패턴:** `AIza[0-9A-Za-z_-]{30,}|sk_live|service_role|(GEMINI|OPENAI|SUPABASE)_[A-Z_]*_KEY[[:space:]]*=[[:space:]]*['"][A-Za-z0-9]`
- **제외:** `*.example.js`, `*.example.ts`, `node_modules/`, `*.md`, `*.lock`, `dist/`, `build/`
- **PASS 조건:** 매치 0건 → exit 0
- **FAIL 시:** 매치 라인 출력 + "🚨 BLOCKER" 메시지 + exit 1

### 2) check-dom-unsafe.sh
- **검사 대상:** `extension/`
- **검사 패턴:** 스킬 §3-1 금지 API 5종 + §1-3 동적 코드 실행 API 2종
- **회피 트릭:** 모든 위험 패턴은 대괄호 한 글자 클래스(예: `[i]nnerHTML`)로 작성 → 스크립트 자기 자신은 매치되지 않음 (self-match 회피).
- **제외:** `dom-safe.js`(헬퍼 자체 정의 허용), `*.example.*`, `node_modules/`
- **PASS 조건:** 매치 0건 → exit 0

### 3) check-rls-enabled.sh (정적 파싱)
- **검사 대상:** `supabase/migrations/*.sql`
- **알고리즘:**
  1. `CREATE TABLE [IF NOT EXISTS] [public.]<name>` 패턴으로 전체 public 테이블 집합 A 추출
  2. `ALTER TABLE [public.]<name> ENABLE ROW LEVEL SECURITY` 패턴으로 ENABLE 집합 B 추출
  3. 차집합 `A − B` 가 누락 테이블 → 이름 출력
- **PASS 조건:** 차집합 빈 결과
- **출력 예:** `감지된 public 테이블: 7개 / RLS ENABLE된 테이블: 7개 / ✅ 모든 public 테이블 RLS ENABLE`

### 3') check-rls-enabled.sql (런타임 보조)
- 실제 Supabase/Postgres 연결 시 사용. `pg_tables` 의 `rowsecurity=false` 검사 + `pg_policies LEFT JOIN` 으로 정책 0개 검사.
- `psql "$DATABASE_URL" -f ...` 또는 Supabase Dashboard SQL Editor 에서 실행.

### 4) check-email-admin.sh
- **검사 대상:** `extension/`, `supabase/migrations/`
- **패턴:** `auth\.email\(\)|email[[:space:]]*===[[:space:]]*['"]|email[[:space:]]*==[[:space:]]*['"]|\.email[[:space:]]*===[[:space:]]*['"]admin`
- **WHY:** 관리자 권한은 `profiles.is_admin` 단일 진실의 원천만 사용해야 함(스킬 §2-3).

### 5) check-sw-async-return.sh
- **검사 대상:** `extension/background/service-worker.js`
- **알고리즘:**
  1. `chrome.runtime.onMessage.addListener` 호출이 존재하는지 확인 (없으면 PASS, 라우터가 다른 파일이라는 경고 출력)
  2. 비동기 패턴(`await`, `Promise`, `.then(`) 흔적 검사
  3. `return true` 존재 검사
- **판정:** 비동기 사용 + `return true` 부재 = ❌ FAIL. 그 외 = ✅ PASS.
- **한계:** 정규식 수준이라 다중 addListener 콜백 분리 불가 — 코드 리뷰로 보완.

### 6) run-all.sh
- 5종 순차 실행. `set -uo pipefail`(전역 -e 미사용)로 개별 실패도 끝까지 수집.
- 종료 시 `✅ PASS: N/5 / ❌ FAIL: M/5` 출력 + 실패 스크립트 이름 나열.
- 하나라도 실패 시 exit 1.

---

## 3. 실행 예시

### 최초 1회 (실행 권한 부여)
```bash
chmod +x _workspace/qa-scripts/*.sh
```
(이미 본 작업에서 적용 완료 — `ls -la` 결과 모두 0755)

### 일괄 실행 (권장)
```bash
bash _workspace/qa-scripts/run-all.sh
```

### 개별 실행
```bash
bash _workspace/qa-scripts/check-hardcoded-keys.sh
bash _workspace/qa-scripts/check-dom-unsafe.sh
bash _workspace/qa-scripts/check-rls-enabled.sh
bash _workspace/qa-scripts/check-email-admin.sh
bash _workspace/qa-scripts/check-sw-async-return.sh
```

### 런타임 RLS 검증 (DB 연결 필요)
```bash
psql "$DATABASE_URL" -f _workspace/qa-scripts/check-rls-enabled.sql
# 또는 Supabase Dashboard > SQL Editor 에 붙여넣기
```

### 예상 출력 (모두 PASS 시)
```
==========================================
🛡  BLOG BenchMarker — QA 횡단 검사 (5종)
==========================================

🔍 [1/5] 하드코딩된 API 키·시크릿 검사 중...
✅ 하드코딩된 키 0건

🔍 [2/5] DOM 안전 헬퍼 우회·동적 코드 실행 검사 중...
✅ DOM 위험 패턴 0건

🔍 [3/5] public 테이블 RLS ENABLE 누락 검사 중...
    감지된 public 테이블: 7개
    RLS ENABLE된 테이블: 7개
✅ 모든 public 테이블 RLS ENABLE

🔍 [4/5] 이메일 비교 기반 관리자 판정 검사 중...
✅ 이메일 기반 관리자 판정 패턴 0건

🔍 [5/5] Service Worker 비동기 응답 패턴 검사 중...
✅ 비동기 패턴 사용 + 'return true' 존재

==========================================
📊 결과 요약
==========================================
✅ PASS: 5/5
❌ FAIL: 0/5

🎉 모든 횡단 BLOCKER 검사 통과!
```

---

## 4. 권장 운영 시점

| 시점 | 명령 | 목적 |
|---|---|---|
| Phase 작업 시작 전 | `bash run-all.sh` | 이전 Phase 회귀 방지 |
| Phase 완료 직후 | `bash run-all.sh` + 해당 Phase 체크리스트 | 신규 위반 즉시 발견 |
| PR 생성 전 | `bash run-all.sh` | 로컬 게이트 |
| (선택) GitHub Actions | `run-all.sh` | CI에서 자동 차단 |

---

## 5. 한계 / 자동화 범위 밖

본 5종은 **정적 분석**이다. 다음은 사람 또는 별도 환경 필요:
- 실제 RLS 우회 시도 (anon key 로 SELECT 호출)
- Edge Function JWT 검증 동작 (curl 로 401 확인)
- Manifest `permissions` ↔ 실제 사용 chrome API 매칭(의도 판정 필요)
- OAuth redirect URL 화이트리스트(Supabase Dashboard 설정)
- 결제 webhook 서명 검증 동작(stub 결제로 e2e 테스트 필요)

이 항목들은 `_workspace/qa_checklist_*.md` 의 HIGH/MEDIUM 항목으로 별도 추적된다.

---

## 6. 다음 단계

1. supabase-backend / extension-core / ui-builder 가 산출물을 만들 때마다 본 스크립트 실행으로 즉시 회귀 확인.
2. 신규 횡단 BLOCKER 패턴이 식별되면 본 폴더에 `check-*.sh` 추가 + `run-all.sh` 의 `CHECKS` 배열 + README 항목 갱신.
3. (선택) GitHub Actions 워크플로 `.github/workflows/qa.yml` 에 `run-all.sh` 호출을 추가하면 PR 단위 자동 차단 가능.
