# Remaining Work

> 현재 구현에서 미구현 / 부분 구현 / 개선 필요 항목.
> 감사일: 2026-04-14
> 우선순위: **P0** 배포 전 필수 · **P1** 1개월 내 · **P2** 백로그

---

## P0 — 배포 전 필수

### P0-1. 아이콘 리소스 (Chrome Web Store 등록 요건)
- **현황:** `extension/icons/README.md` 만 존재. 실제 `icon16.png`, `icon48.png`, `icon128.png` 파일 없음.
- **영향:** `chrome://extensions` 로드 시 경고 + Web Store 심사 거절.
- **작업:** 브랜드 아이콘 디자인(SVG → PNG 3 사이즈 변환) + `icons/` 에 배치.

### P0-2. 프로덕션 빌드 파이프라인 (`scripts/` 비어있음)
- **현황:** ES Module `import` 이 content script / service worker 양쪽에 쓰이나 MV3 기본은 content script ESM 미지원. service-worker 는 `type: "module"` 로 가능.
- **영향:** 배포 시 content script 의 import 실패 가능성. 개발 환경에서는 `type: module` 로 동작하지만 **엄밀한 MV3 번들링 필요**.
- **작업:**
  - `scripts/build.mjs` — esbuild 로 content script + sidepanel + mypage + admin 번들
  - `scripts/strip-logs.mjs` — 프로덕션 `console.log` 제거
  - `scripts/zip-release.sh` — `dist/` → `release-vX.Y.Z.zip`

### P0-3. Supabase 실배포
- **현황:** 8개 migration SQL, 4개 Edge Function 소스 작성 완료. 실제 `supabase db push` / `supabase functions deploy` **미실행** (사용자 수동 작업).
- **영향:** DB 스키마 / Edge Function 이 staging/prod 에 반영 안 됨.
- **작업:**
  1. `supabase link` → 프로젝트 연결
  2. `supabase db push` → 8개 마이그레이션 순차 적용
  3. `supabase secrets set GEMINI_API_KEY=... TOSS_SECRET_KEY=... PORTONE_API_KEY=...`
  4. `supabase functions deploy generate-content extract-youtube verify-subscription admin-actions`
  5. Supabase Dashboard 에서 `pg_cron` 확장 활성화 + `expire_due_subscriptions()` 스케줄 등록

### P0-4. Tailwind CDN 제거 (CSP 위반)
- **현황:** 일부 HTML 에 `<script src="https://cdn.tailwindcss.com">` 가 있었으나 최근 auth.css 분리로 대부분 해소됨. 재검증 필요.
- **영향:** MV3 `script-src 'self'` CSP 에 위반되어 차단됨.
- **작업:** `grep -rn "cdn.tailwind" extension/` 0건 확인. 남아 있으면 로컬 컴파일 번들로 교체.

### P0-5. 개인정보 처리방침 페이지
- **현황:** `docs/privacy.md` 부재. Chrome Web Store 등록 요건.
- **영향:** 심사 거절.
- **작업:** `docs/privacy.md` (수집 데이터: 이메일/사용량/학습 콘텐츠 · 저장 위치: Supabase · 삭제 요청 절차 · 결제 정보 미저장 명시).

---

## P1 — 1개월 내

### P1-1. Phase 10.2 — i18n 2차 이관 (나머지 JS)
- **현황:** messages.json 3 locale 완비, i18n.js 인프라 완료. HTML 전면 적용. 그러나 아래 JS 파일은 여전히 한국어 하드코딩:
  - `extension/sidepanel/tabs/{analyze,benchmark,generate,learning,mypage,youtube,tools}-tab.js`
  - `extension/sidepanel/tabs/benchmark-stats-section.js`
  - `extension/sidepanel/components/*.js` (9개)
  - `extension/auth/{login,signup,reset}.js` (폼 검증 문구)
- **영향:** en/ja 설정 사용자에게 해당 화면의 일부 문자열이 한국어로 노출.
- **작업:** `i18n_key_registry.md §3 치환 패턴 템플릿` 에 따라 기계적 치환. key 는 이미 등록됨.

### P1-2. 전문 번역 검수 (en/ja)
- **현황:** `_locales/{en,ja}/messages.json` 에 `_note_: "TODO: professional translation"` 명시. 현재는 기계번역 초벌.
- **영향:** en/ja 사용자 UX 저하.
- **작업:** 원어민 검수 한 바퀴 + 용어 통일 (특히 마케팅 문구 `auth_login_title`, `benchmark_subtitle`, `generate_hint_*`).

### P1-3. Manifest i18n 전환
- **현황:** `manifest.json` 의 `"name"` / `"description"` / `"action.default_title"` 이 literal 한국어.
- **작업:** `"name": "__MSG_app_name__"` 형태로 교체 (`app_name`, `app_description`, `app_action_title` key 는 이미 3 locale 에 등록됨).

### P1-4. 테스트 하니스 / 유닛 테스트
- **현황:** `*.test.ts`, `__tests__/` 없음. 분석기(seo-analyzer, hook-detector, nlp-utils) 가 순수 함수임에도 검증 자동화 없음.
- **영향:** 리팩토링 시 회귀 위험.
- **작업:**
  - `vitest` 도입 (extension 쪽 pure function)
  - `deno test` (supabase/functions/_shared 쪽)
  - CI: GitHub Actions 로 PR 마다 실행

### P1-5. Realtime 구독 동작 검증 (4.1)
- **현황:** TASKS.md 에 `[~]` 마킹. benchmark-repo.js 의 Realtime 구독 구현 여부 코드 레벨 확인 필요.
- **작업:** `supabase.channel(...).on('postgres_changes', ...)` 등록 확인 + 다기기 테스트 (integration test §4).

### P1-6. Edge Function 부하/장애 테스트
- **현황:** 개발 환경에서의 happy path 만 검증됨.
- **작업:**
  - 1분 내 11회 호출 → `rate_limit` 응답 확인
  - GEMINI_API_KEY 무효값 설정 → `invalid_key` 응답 확인
  - 자막 없는 영상 → `no_transcripts` 확인
  - 토스 webhook 서명 위조 → 401 확인

### P1-7. RLS 실제 거부 테스트
- **현황:** SQL 정책은 존재. 실제 anon key 로 타 유저 row SELECT 시도 → 0 rows 반환 확인은 미실행.
- **작업:** `qa-scripts/` 디렉토리에 `test-rls.sh` — `curl` + anon/service_role 양쪽으로 테이블 접근 검증.

---

## P2 — 백로그

### P2-1. MV3 content script 번들링
- ESM import 미지원 이슈 (P0-2 와 연결). esbuild IIFE 로 일괄 번들.

### P2-2. 형태소 분석 고도화
- 현재 조사 제거 + 불용어 방식. 정확도 개선이 필요하면 `Khaiii` / `Mecab-light` WASM 포팅. 벤치마크 통계 정확도 영향.

### P2-3. Intl 포맷터
- 숫자 (1,234 vs 1.234), 날짜, 상대 시간 (3일 전) 의 locale-aware 처리. 현재는 한국어 포맷 하드코딩.

### P2-4. 복수형 (ICU MessageFormat)
- chrome.i18n 은 plural 미지원. "3일 남음" vs "1일 남음" 은 `t('key', [n])` 이후 JS 분기로 처리 중. 확장 언어 추가 시 한계.

### P2-5. Admin 감사 로그 retention 정책
- `admin_audit_logs` 테이블이 무한 증가. 1년 이후 `archive` 정책 필요.

### P2-6. BYOK (Bring Your Own Key)
- PRD §플랜 정책: "FREE는 본인 Gemini API 키 입력 시 무제한 사용 가능". 현재 Edge Function 은 서버 키만 사용. 사용자 키 주입 경로 + 안전 저장(encrypted at rest) 설계 필요.

### P2-7. RTL 언어 지원
- 아랍어/히브리어 추가 시 `dir="rtl"` 스타일 분기. 현재 LTR 전용.

### P2-8. YouTube segments 엔드포인트
- 현재 응답에서 `transcript.segments[]` 제외(용량). 타임라인 기반 UI 가 생기면 별도 endpoint `/functions/v1/extract-youtube-full` 추가.

### P2-9. 성능 모니터링
- Edge Function 지연/에러율 대시보드. Supabase Dashboard + `pg_stat_statements` 활성화 + Sentry 연동 검토.

### P2-10. 오프라인 모드
- 분석 엔진은 순수 JS 로 오프라인 가능. 학습 데이터/벤치마크는 네트워크 필요. 오프라인 감지 배너 개선.

### P2-11. Tools 탭 고도화
- 현재 글자수/뽀모도로/금칙어/캡처는 기본 동작만. 사용자 피드백 수집 후 UX 개선 (단축키, 설정 persistence 등).

### P2-12. `docs/api.md` 작성
- Edge Function 계약은 `edge_function_contracts.md` 에 있으나 내부 사용자(향후 팀원) 용 README 가 없음.

---

## 우선순위 매트릭스

| 우선순위 | 개수 | 총 작업일 (대략) |
|---------|------|---------------|
| P0 | 5 | 5~7일 |
| P1 | 7 | 14~21일 |
| P2 | 12 | 30일+ |

**배포 가능 최소 조건:** P0-1, P0-2, P0-3, P0-4, P0-5 전원 완료.
**안정 운영 조건:** + P1-4, P1-5, P1-6, P1-7.

---

## 변경 이력

| 날짜 | 변경 |
|------|------|
| 2026-04-14 | 초판 — 통합 감사 기준 |
