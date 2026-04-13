# QA Fix Summary — Phase 1.3 BLOCKER 수정 + qa-scripts 오탐 보정

> 작성일: 2026-04-14
> 작성자: security-qa 에이전트(검수자)
> 근거 리포트: `_workspace/qa_report_1.3.md` (B-2, C-1 BLOCKER)

---

## 작업 1 — extension/manifest.json BLOCKER 2건 수정

### A. `activeTab` 제거 (BLOCKER B-2)
- **변경 전:** `permissions: ["storage", "sidePanel", "scripting", "activeTab"]`
- **변경 후:** `permissions: ["storage", "sidePanel", "scripting"]`
- **사유:** 스킬 `chrome-extension-security §1-1` "activeTab과 host_permissions 동시 사용 금지". 본 프로젝트는 네이버 블로그 고정 도메인 정적 주입 방식이므로 `host_permissions` 유지, `activeTab` 제거.

### B. `host_permissions` 도메인 한정 (BLOCKER C-1)
- **변경 전:** `["*://*.naver.com/*"]`
- **변경 후:**
  ```json
  "host_permissions": [
    "https://blog.naver.com/*",
    "https://*.blog.naver.com/*",
    "https://m.blog.naver.com/*"
  ]
  ```
- **사유:** (1) `*://` 스킴 제거로 HTTP 차단, (2) `*.naver.com` 전체 서브도메인(mail/cafe/shopping 등) 노출 제거. 스킬 §1-1 권장 패턴 그대로 적용.

### 검증
- `manifest.json` 외 `extension/` 다른 파일 미수정.
- `supabase/migrations/`, `extension/auth/`, `extension/lib/` 미수정.
- 횡단 검사 `check-dom-unsafe.sh`, `check-hardcoded-keys.sh` 등 5종 모두 PASS 유지.

---

## 작업 2 — `_workspace/qa-scripts/` 오탐 수정

### check-hardcoded-keys.sh 개선 (3가지)

| # | 개선 내용 | 적용 방식 |
|--:|---|---|
| 1 | `extension/lib/env-config.js` 제외 | grep `--exclude='env-config.js'` 옵션 추가 (.gitignore 대상이므로 실제 키 보관소가 잡히는 오탐 차단) |
| 2 | `.sql` 파일의 `--` 주석 라인 제외 | 1차 grep 결과를 후처리: `grep -vE '\.sql:[0-9]+:[[:space:]]*--'` (롤백 주석 안의 `service_role` 등 키 모양 토큰 무시) |
| 3 | Supabase Publishable Key 제외 | 후처리: `grep -vE 'sb_publishable_[A-Za-z0-9_-]+'` (anon key 후속 명칭, 공개 OK) |

**구조 변경:**
- 기존: 단일 grep 호출만으로 판정.
- 개선: `RAW_MATCHES` → `FILTERED` 두 단계 파이프라인. 화이트리스트 통과 후 남은 라인만 BLOCKER로 보고.

### check-rls-enabled.sh 다중 테이블 파일 처리 확인
- 기존 로직이 `grep -h ... "${SQL_FILES[@]}"` 로 모든 파일을 한 번에 스캔하고 `sed` 로 테이블명만 추출 → `sort -u` 로 집합화.
- 한 파일에 `CREATE TABLE` 가 여러 개 있어도 grep이 라인별 매치를 모두 반환하므로 **다중 테이블 정상 감지**. 수정 불필요.
- 실제 실행 결과: `감지된 public 테이블: 7개 / RLS ENABLE된 테이블: 7개` — 마이그레이션 003(benchmarks 등 복합 파일) 포함 정상 동작 확인.

---

## last-run.log 결과 (5/5 PASS)

```
==========================================
🛡  BLOG BenchMarker — QA 횡단 검사 (5종)
==========================================

🔍 [1/5] 하드코딩된 API 키·시크릿 검사 중...
    검사 대상: extension/, supabase/
✅ 하드코딩된 키 0건 (env-config.js, .sql 주석, sb_publishable_* 제외)

🔍 [2/5] DOM 안전 헬퍼 우회·동적 코드 실행 검사 중...
    검사 대상: extension/
✅ DOM 위험 패턴 0건

🔍 [3/5] public 테이블 RLS ENABLE 누락 검사 중...
    검사 대상: supabase/migrations/*.sql
    감지된 public 테이블: 7개
    RLS ENABLE된 테이블: 7개
✅ 모든 public 테이블 RLS ENABLE

🔍 [4/5] 이메일 비교 기반 관리자 판정 검사 중...
    검사 대상: extension/, supabase/migrations/
✅ 이메일 기반 관리자 판정 패턴 0건

🔍 [5/5] Service Worker 비동기 응답 패턴 검사 중...
    검사 대상: extension/background/service-worker.js
✅ 비동기 패턴 사용 + 'return true' 존재 (35 줄 등)

==========================================
📊 결과 요약
==========================================
✅ PASS: 5/5
❌ FAIL: 0/5

🎉 모든 횡단 BLOCKER 검사 통過!
```

전체 종료코드: **0** (5/5 PASS).
원본 로그 파일: `_workspace/qa-scripts/last-run.log`.

---

## 다음 단계 권장

1. Phase 1.3 재검증 — `qa_report_1.3.md` 의 BLOCKER B-2, C-1 항목을 PASS 로 갱신.
2. 남은 HIGH 항목(F-5, H-2: `sender.id === chrome.runtime.id` 라우터 가드)은 후속 PR로 처리.
3. `_locales/ko/messages.json` 스텁 + `icons/*.png` placeholder는 MEDIUM 으로 별도 백로그.
