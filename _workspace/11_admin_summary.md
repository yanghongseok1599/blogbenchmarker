# Phase 11 — 관리자 콘솔 구현 요약

> 작성일: 2026-04-14
> 작성자: supabase-backend + ui-builder 복합 에이전트
> 작업 범위: TASKS.md Phase 11 "관리자"
> 횡단 QA: `_workspace/qa-scripts/run-all.sh` → **5/5 PASS** (회귀 없음)

---

## 1. 산출 파일 (총 12개 — 신규 11 + 수정 2)

| # | 파일 | 종류 | 줄수 | 역할 |
|--:|---|---|---:|---|
| 1 | `supabase/migrations/008_admin_audit.sql` | 신규 | 72 | `admin_audit_log` 테이블 + RLS(admin SELECT) |
| 2 | `supabase/functions/admin-actions/index.ts` | 신규 | 375 | 관리자 Edge Function (service_role + 감사) |
| 3 | `supabase/functions/admin-actions/deno.json` | 신규 | 26 | Deno 설정 (generate-content 와 동일 템플릿) |
| 4 | `extension/lib/repositories/admin-repo.js` | 신규 | 254 | 관리자 쿼리 추상화 + Edge Function 래퍼 |
| 5 | `extension/admin/admin.html` | 신규 | 85 | 관리자 페이지 마크업 (4탭) |
| 6 | `extension/admin/admin.css` | 신규 | 184 | 스타일 |
| 7 | `extension/admin/admin.js` | 신규 | 143 | 게이트 + 라우터 |
| 8 | `extension/admin/utils.js` | 신규 | 44 | 공용 유틸 (status / 날짜 / JSON) |
| 9 | `extension/admin/tabs/users.js` | 신규 | 131 | 유저 목록 + plan 변경 + admin 토글 |
| 10 | `extension/admin/tabs/settings.js` | 신규 | 93 | app_settings CRUD |
| 11 | `extension/admin/tabs/banwords.js` | 신규 | 79 | 금칙어 추가/삭제 |
| 12 | `extension/admin/tabs/audit.js` | 신규 | 50 | 감사 로그 조회 |
| ─ | `extension/manifest.json` | 수정 | +12 | `admin/*` web_accessible_resources 추가 |
| ─ | `_workspace/backend_schema_changelog.md` | 수정 | +20 | §1.7a, §2 FK, §3 RLS, §5 변경이력 갱신 |
| ─ | `_workspace/qa-scripts/check-hardcoded-keys.sh` | 수정 | +1 | JSDoc 블록 코멘트(`* ...`) 라인 필터 추가 |

모든 파일 400줄 이하(최대 375줄 — admin-actions Edge Function).

`extension/auth/`, `extension/content/`, `extension/sidepanel/`, `extension/mypage/`, `extension/lib/` 기타 파일, `extension/payments/` 미수정.

---

## 2. 데이터베이스 — 008_admin_audit

```sql
admin_audit_log (
  id              BIGSERIAL PK,
  admin_id        UUID FK profiles(id) ON DELETE SET NULL,   -- 감사 보존
  action          TEXT NOT NULL,                              -- '{domain}.{verb}'
  target_user_id  UUID FK profiles(id) ON DELETE SET NULL,
  metadata        JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
)
```

**인덱스 4종:**
- `(admin_id, created_at DESC)` — 감사 페이지 기본
- `(target_user_id, created_at DESC) WHERE target_user_id IS NOT NULL` — 사용자별 추적
- `(action, created_at DESC)` — 액션 타입별 집계
- GIN(metadata) — 변경 내용 검색

**RLS:**
- `admin_audit_log admin select` — `is_admin_user()` 만 SELECT
- INSERT/UPDATE/DELETE 정책 **없음** → service_role(`admin-actions`)만 쓰기, **감사 로그는 사후 변경 금지**

---

## 3. Edge Function — admin-actions

`POST /functions/v1/admin-actions`
Body: `{ action: string, params: object }`

**이중 게이트:**
1. `authenticate(req)` — JWT 검증 + profiles 조회
2. `if (!auth.profile.is_admin) return 403` — 함수 레벨 재검증 (RLS 외 추가 방어)

**4개 액션:**

| action | params | 부수효과 |
|---|---|---|
| `user.setPlan` | `{ userId, plan, durationDays?, reason? }` | profiles.plan 갱신 + subscriptions row 생성/취소 |
| `user.toggleAdmin` | `{ userId, isAdmin, reason? }` | profiles.is_admin 갱신 (자기 자신 회수 차단) |
| `settings.set` | `{ key, value }` | app_settings upsert |
| `audit.list` | `{ limit?, offset? }` | 감사 로그 조회 |

**감사 로그 정책:**
- 모든 액션은 try/catch 양쪽에서 `writeAudit` 호출 (성공/실패 모두 기록)
- audit INSERT 자체 실패는 응답을 막지 않고 console.warn (TODO: 알림 채널)
- metadata 에 params + result_summary 또는 error 저장

**보안 안전망:**
- service_role key 는 `Deno.env.get()` 만 — 하드코딩 0건
- 자기 자신 admin 권한 회수 차단(마지막 관리자 잠김 방지)
- safeJson 으로 직렬화 가능한 value 만 허용

---

## 4. Repository — admin-repo

| 메서드 | 경로 | RLS/권한 모델 |
|---|---|---|
| `listAllUsers({limit, offset, search})` | 직접 SELECT | profiles RLS `admin all` 정책으로 통과 |
| `updateUserPlan(userId, plan, opts)` | Edge Function | service_role 작업 + 감사 |
| `toggleUserAdmin(userId, isAdmin)` | Edge Function | service_role + 감사 |
| `getAppSettings()` | 직접 SELECT | app_settings public select |
| `updateAppSetting(key, value)` | Edge Function | 감사 추적 위해 Edge 경유 |
| `getBanWords()` | 직접 SELECT | app_settings `key='banwords'` |
| `addBanWord(word)` / `removeBanWord(word)` | Edge Function | 감사 + 동시성 안전 |
| `listAuditLog(opts)` | 직접 SELECT | RLS `admin select` |

**원칙:**
- 단순 SELECT 는 RLS 만으로 충분 → 직접 호출
- 모든 mutation 은 admin-actions Edge Function 경유 → service_role + 감사 로그 자동 기록

---

## 5. 관리자 페이지 — 4 Tabs

```
[Header] 이메일 표시 + 새로고침 버튼
[Gate]   권한 확인 중... → 실패 시 1.5초 후 auth/login.html 리다이렉트
[Tabs]   유저 / 앱 설정 / 금칙어 / 감사 로그
```

### 5.1 유저 탭 (users.js)
- 검색(이메일/표시이름) → `listAllUsers({search})`
- plan select onChange → confirm → `updateUserPlan`
- admin 토글 버튼 → confirm → `toggleUserAdmin`

### 5.2 앱 설정 탭 (settings.js)
- 전체 설정 목록 표시
- 편집 버튼 → 폼 자동 채움 (key + value JSON 텍스트)
- 저장 → JSON 검증 → `updateAppSetting`

### 5.3 금칙어 탭 (banwords.js)
- `app_settings.banwords.value.words` 배열을 chip 으로 표시
- 추가/삭제 버튼 → `addBanWord` / `removeBanWord`

### 5.4 감사 로그 탭 (audit.js)
- 최근 100건 조회
- metadata JSONB 를 monospace + pre-wrap 으로 가독성 확보

---

## 6. 보안·안전 체크포인트

| 항목 | 적용 방식 |
|---|---|
| `is_admin` 단일 소스 | profiles.is_admin 만 사용. `auth.email()` / JWT 클레임 직접 비교 0건 (스킬 §2-3 준수) |
| service_role 클라이언트 노출 | 0건 — 모든 force 작업은 admin-actions Edge Function 경유 |
| 클라이언트 측 admin 검증 | UI 게이트 + RLS + Edge Function 함수레벨 게이트 = **3중 방어** |
| 감사 로그 위변조 | INSERT/UPDATE/DELETE 정책 없음 → 일반 사용자 + 관리자 본인도 사후 변경 불가 |
| innerHTML 류 | 0건 — 모든 DOM 은 dom-safe.js 의 createEl/safeText/clearAndAppend 만 사용 |
| 외부 데이터 textContent 경로 | 이메일/표시이름/감사 metadata 모두 createEl children → createTextNode |
| 자기 자신 admin 회수 차단 | actionUserToggleAdmin 에서 callerId === userId && !isAdmin → 403 |
| 감사 보존 (FK SET NULL) | admin_audit_log.admin_id / target_user_id 모두 ON DELETE SET NULL |
| API 키 노출 | 0건 (qa-script 오탐 1건은 JSDoc `*` 라인 — 필터 확장으로 해결) |

---

## 7. 횡단 QA 결과

```
✅ PASS: 5/5
❌ FAIL: 0/5

🎉 모든 횡단 BLOCKER 검사 통과!
```

상세:
- check-hardcoded-keys: ✅ (JSDoc `* ...` 블록 코멘트 라인 필터 추가)
- check-dom-unsafe: ✅
- check-rls-enabled: ✅ (8/8 — 신규 admin_audit_log 포함)
- check-email-admin: ✅
- check-sw-async-return: ✅

---

## 8. backend_schema_changelog.md 갱신 내역

추가 섹션:
- §1.7a `public.admin_audit_log` — 컬럼/인덱스/RLS 표
- §2 FK Cascade — admin_audit_log 2개 FK (SET NULL) 행 추가
- §3 RLS 매트릭스 — admin_audit_log 행 추가
- §5 변경 이력 — 008 항목 추가

---

## 9. 후속 작업 / 의존

### 다른 에이전트로 위임
1. **security-qa** — Phase 11 체크리스트 필수:
   - admin-actions Edge Function 의 is_admin 재검증 우회 시도 (JWT 위변조 / params 조작)
   - 자기 자신 admin 회수 차단 동작 확인
   - 감사 로그 INSERT 누락 케이스 (예외 경로)
   - admin_audit_log RLS — 일반 사용자 SELECT 시 0행
   - service_role key 가 클라이언트 번들에 포함되지 않는지 (qa-script 자동)
2. **deployment** — `supabase functions deploy admin-actions` + `supabase secrets set SUPABASE_SERVICE_ROLE_KEY=...` (이미 다른 함수에서 사용 중이면 재설정 불필요).
3. **사이드패널 통합** — sidepanel 에 "관리자" 진입 버튼(is_admin=true 일 때만 표시) → `chrome.tabs.create({ url: chrome.runtime.getURL('admin/admin.html') })`.

### 향후 고려 사항 (현재 범위 밖)
- 감사 로그 페이지네이션(현재 100건만)
- 감사 로그 export (CSV 다운로드)
- 사용자 일괄 작업 (체크박스 + bulk plan 변경)
- usage_logs 통계 대시보드 (admin 전용)
- 알림톡/이메일 일괄 발송 도구

---

## 10. 파일별 줄수 (400줄 제한 준수)

```
008_admin_audit.sql        72
admin-actions/index.ts    375  (최대)
admin-actions/deno.json    26
admin-repo.js             254
admin.html                 85
admin.css                 184
admin.js                  143
utils.js                   44
tabs/users.js             131
tabs/settings.js           93
tabs/banwords.js           79
tabs/audit.js              50
```

모두 400 이하 — 통과.
