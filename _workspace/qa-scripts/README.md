# QA 횡단 자동화 스크립트 (qa-scripts/)

> BLOG BenchMarker 프로젝트의 **횡단(cross-cutting) BLOCKER 5종**을 매 Phase 시작 전·후에 자동 검증한다.
> 근거: `_workspace/qa_master_report.md §3`, `.claude/skills/boundary-qa/SKILL.md §8`.

---

## 한 줄 사용법

```bash
bash _workspace/qa-scripts/run-all.sh
```

종료코드가 0이면 통과, 1이면 BLOCKER 발견. CI/PR 게이트에 그대로 연결 가능.

---

## 스크립트 목록

| 번호 | 파일 | 역할 | 종료코드 0 조건 |
|---:|---|---|---|
| 1 | `check-hardcoded-keys.sh` | API 키·시크릿 하드코딩 검사 | extension/, supabase/ 안에 매치 0건 |
| 2 | `check-dom-unsafe.sh` | XSS/CSP 위험 DOM API 검사 | extension/ 안에 위험 패턴 0건 |
| 3 | `check-rls-enabled.sh` | RLS ENABLE 누락 정적 검사 | 모든 public 테이블이 RLS ENABLE |
| 3' | `check-rls-enabled.sql` | RLS ENABLE 누락 런타임 검사(psql) | 두 SELECT 모두 0 row |
| 4 | `check-email-admin.sh` | 이메일 비교 기반 관리자 판정 검사 | 매치 0건 |
| 5 | `check-sw-async-return.sh` | Service Worker 비동기 응답 패턴 검사 | 비동기 사용 시 `return true` 존재 |
| ─ | `run-all.sh` | 위 5종을 순차 실행하고 종합 결과 출력 | 5종 모두 PASS |

> `check-rls-enabled.sql` 은 실제 DB에 연결된 상태에서 `psql "$DATABASE_URL" -f ...` 로 실행하는 보조 도구. `run-all.sh` 는 정적 파싱 버전(`.sh`)만 호출한다.

---

## 1. check-hardcoded-keys.sh

**검사:** `extension/`, `supabase/` 디렉터리 안의 다음 패턴.
- Google API 키 (`AIza...`)
- Stripe live 키 (`sk_live`)
- Supabase service_role 키
- `GEMINI_API_KEY="..."`, `OPENAI_API_KEY='...'`, `SUPABASE_*_KEY="..."` 인라인 할당

**제외:** `*.example.js`, `*.example.ts`, `node_modules/`, `*.md`, `*.lock`

**실행:**
```bash
bash _workspace/qa-scripts/check-hardcoded-keys.sh
```

**근거:** `chrome-extension-security §4-4`, `supabase-migration-rules §4-3`

---

## 2. check-dom-unsafe.sh

**검사:** `extension/` 안의 다음 패턴 (스킬 `chrome-extension-security §3-1` 금지 API 표 기준).
- 위험 HTML 속성 직접 할당 패턴 5종
- 동적 코드 실행 API 2종 (스킬 §1-3)

> 패턴은 self-match 회피용 대괄호 한 글자 클래스(예: `[i]nnerHTML`)로 작성되어 있어, 이 스크립트 자신은 검사 대상이 되지 않는다.

**제외:** `dom-safe.js`(헬퍼 자체), `*.example.*`, `node_modules/`, `dist/`

**실행:**
```bash
bash _workspace/qa-scripts/check-dom-unsafe.sh
```

**근거:** `chrome-extension-security §3`

---

## 3. check-rls-enabled.sh / .sql

### 정적 파싱 (`.sh`) — 마이그레이션 파일만으로 검증
**검사 절차:**
1. `supabase/migrations/*.sql` 에서 `CREATE TABLE [IF NOT EXISTS] [public.]<name>` 패턴 추출 → 모든 public 테이블 집합 A
2. 같은 파일들에서 `ALTER TABLE [public.]<name> ENABLE ROW LEVEL SECURITY` 패턴 추출 → ENABLE된 테이블 집합 B
3. `A − B` 차집합 = 누락. 누락 테이블 이름 출력.

**한계:** 인라인 형태의 RLS ENABLE(예: `CREATE TABLE` 직후 별도 ENABLE 문 없는 경우)이 있다면 누락으로 잡힌다 — 의도된 보수적 동작.

**실행:**
```bash
bash _workspace/qa-scripts/check-rls-enabled.sh
```

### 런타임 SQL (`.sql`) — 실제 DB 연결 필요
```bash
psql "$DATABASE_URL" -f _workspace/qa-scripts/check-rls-enabled.sql
# 또는 Supabase Dashboard > SQL Editor 에 붙여넣기
```

두 SELECT 결과가 모두 빈 결과여야 통과.

**근거:** `supabase-migration-rules §2-1`, `boundary-qa §3-3 §3-4`

---

## 4. check-email-admin.sh

**검사:** `extension/`, `supabase/migrations/` 안의 다음 패턴.
- `auth.email()` — Postgres RLS에서 이메일 직접 비교
- `email === '...'`, `email == "..."` — JS 동등 비교
- `.email === 'admin...` — admin 계정/도메인 하드코딩

**WHY:** 관리자 권한은 반드시 `profiles.is_admin` 단일 진실의 원천으로만 판정. 이메일은 변경 가능·하드코딩 리스크가 있다.

**실행:**
```bash
bash _workspace/qa-scripts/check-email-admin.sh
```

**근거:** `supabase-migration-rules §2-3`, `chrome-extension-security §4`

---

## 5. check-sw-async-return.sh

**검사:** `extension/background/service-worker.js` 안의 `chrome.runtime.onMessage.addListener` 콜백.
- 비동기 패턴(`await`, `Promise`, `.then(`) 사용 흔적 검사
- 동시에 `return true` 가 존재하는지 검사

**판정:**
- 비동기 사용 + `return true` 존재 → ✅ PASS
- 비동기 사용 + `return true` 없음 → ❌ FAIL (BLOCKER)
- 비동기 미사용 → ℹ️ 검사 불필요로 PASS

**WHY:** MV3 Service Worker 에서 비동기 sendResponse 사용 시 콜백이 true 를 반환하지 않으면 응답 채널이 즉시 닫혀 sendResponse 호출이 유실된다. 사용자 측 UI는 영원히 응답을 기다리게 된다.

**한계:** 정규식 수준 검사이므로 콜백 경계를 정확히 인식하지 못한다. 다중 addListener 콜백이 있는 경우 false negative 가능 — 별도 코드 리뷰로 보완.

**실행:**
```bash
bash _workspace/qa-scripts/check-sw-async-return.sh
```

**근거:** `chrome-extension-security §2-1`

---

## run-all.sh — 일괄 실행

5종을 순차 실행하고 마지막에 `✅ PASS / ❌ FAIL` 카운트를 출력한다. 하나라도 실패하면 종료코드 1.

```bash
bash _workspace/qa-scripts/run-all.sh
```

**언제 돌리나:**
- 매 Phase **작업 시작 전** — 이전 Phase 회귀 방지
- 매 Phase **완료 직후** — 새로 도입된 위반 즉시 발견
- PR 생성 전 — 로컬 게이트
- (선택) GitHub Actions 등 CI 파이프라인의 PR 체크에 연결

---

## 실행 권한 부여 (최초 1회)

```bash
chmod +x _workspace/qa-scripts/*.sh
```

권한이 없어도 `bash run-all.sh` 형태로 실행 가능하지만, 직접 호출(`./run-all.sh`)을 위해서는 권장.

---

## 종료코드 일람

| 종료코드 | 의미 |
|---:|---|
| 0 | 통과 (또는 검사 대상 디렉터리 없음 → 골격 생성 전 정상 상황) |
| 1 | BLOCKER 발견 — Phase 진행 전 즉시 수정 필요 |

`run-all.sh` 도 동일 규칙을 따른다. 하나라도 실패하면 1.

---

## 한계 / 보완 필요

본 스크립트는 **정적 분석** 수준이다. 다음은 자동화 범위 밖이며 별도 검증 필요:

1. **실제 RLS 우회 시도** — anon key 로 `from('learning_data').select('*')` 호출해 본인 외 row 가 안 보이는지 확인 (Supabase 환경 필요).
2. **Edge Function JWT 검증** — `curl` 로 인증 헤더 없이 호출 시 401 응답 확인.
3. **Manifest 권한 vs 실제 사용 chrome API 매칭** — `permissions` 배열과 `grep "chrome\..*"` 결과의 차집합 분석은 사람이 의도와 함께 판정해야 함.
4. **OAuth redirect URL 화이트리스트** — Supabase Dashboard 설정 영역.

이 항목들은 `_workspace/qa_checklist_*.md` 의 HIGH/MEDIUM 항목으로 별도 추적된다.
