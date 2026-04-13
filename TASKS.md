# BLOG BenchMarker - 작업 체크리스트

병렬 작업 가능하도록 분할. 작업 시작 시 `[ ]` → `[in_progress @세션이름]`, 완료 시 `[x]` + 커밋 해시.

> 범례: `[x]` 완료 · `[~]` 부분 구현 (핵심 기능 있음, 보완 필요) · `[ ]` 미착수
> 감사일: 2026-04-14

## Phase 1: 기반 구축 (순차 진행 권장)

### 1.1 Supabase 프로젝트 셋업
- [x] Supabase 새 프로젝트 생성 (trainermilestone-blogbenchmarker, NANO plan)
- [x] 환경 변수 정리 (SUPABASE_URL, SUPABASE_ANON_KEY=Publishable key) — extension/lib/env-config.js 작성 완료
- [x] `lib/env-config.example.js` 작성 (extension/lib/env-config.example.js, Publishable key 포맷 반영)
- [x] `.gitignore`에 `lib/env-config.js` 추가 (프로젝트 루트 .gitignore)

### 1.2 DB 스키마 + RLS (commit: multi-commit)
- [x] `supabase/migrations/001_users.sql` (profiles 테이블 + auth 트리거 + language/updated_at + set_updated_at)
- [x] `supabase/migrations/002_learning_data.sql`
- [x] `supabase/migrations/003_benchmarks.sql` (benchmark_blogs + benchmark_posts)
- [x] `supabase/migrations/004_usage_logs.sql`
- [x] `supabase/migrations/005_settings.sql` (app_settings key-value + subscriptions status/gateway/payment_id)
- [x] `supabase/migrations/006_rls.sql` (모든 RLS 정책 + is_admin_user() 함수 추출)
- [~] `supabase db push`로 적용 + 검증 — SQL 파일 완료, 실제 push 는 사용자 직접 수행

### 1.3 확장프로그램 골격 (commit: multi-commit)
- [x] `extension/manifest.json` 작성 (Manifest V3, 필요 권한만)
- [x] `extension/lib/supabase-client.js` (chrome.storage adapter 포함)
- [x] `extension/background/service-worker.js` (메시지 라우터)
- [x] 기본 아이콘 + 사이드패널 스켈레톤 (icons/README.md — 실제 PNG 는 TODO)

## Phase 2: 인증 (Phase 1 완료 후)

### 2.1 Supabase Auth 통합 (commit: multi-commit)
- [x] `extension/auth/login.html` (이메일/비밀번호 + Google OAuth)
- [x] `extension/auth/login.js`
- [x] `extension/auth/signup.html` / `signup.js`
- [x] `extension/auth/reset.html` / `reset.js`
- [x] `extension/auth/auth-error-map.js` — i18n key 기반 에러 매핑
- [x] `extension/auth/auth.css`
- [x] `extension/lib/repositories/user-repo.js` (profile CRUD)
- [x] 회원가입 시 profiles 자동 생성 트리거 (DB — handle_new_user SECURITY DEFINER)
- [x] 이메일 인증 플로우 — Supabase Auth 기본 동작
- [x] 비밀번호 재설정

### 2.2 권한/세션 관리 (commit: multi-commit)
- [x] `extension/background/handlers/auth-handler.js`
- [x] 세션 갱신 자동화 검증 (Supabase SDK 자동 처리 — autoRefreshToken:true)
- [x] 로그아웃 시 storage 완전 정리 + 자동 재로그인 방지

## Phase 3: 핵심 분석 기능 (Phase 1 완료 후, 2와 병렬 가능)

### 3.1 SEO 분석 (commit: multi-commit)
- [x] `extension/lib/analyzers/seo-analyzer.js` (100점 5섹션 체계)
- [x] `extension/lib/analyzers/nlp-utils.js`
- [x] `extension/lib/analyzers/hook-detector.js` (개선판 — 최소 2개 조건 충족, confidence 점수)
- [x] `extension/content/extractor.js` (네이버 블로그 DOM 파싱 — SmartEditor ONE / 구버전 iframe / 레거시)
- [x] `extension/content/analyzer.js` (점수 계산 + 학습 저장 연계)

### 3.2 글쓰기 페이지 사이드바 (commit: multi-commit)
- [x] `extension/content/sidebar-injector.js`
- [x] `extension/content/sidebar.html` / `sidebar.js`
- [x] `extension/content/content.css`
- [x] 실시간 분석 (debounce) — analyzer-bridge.js 경유

### 3.3 사이드패널 분석 탭 (commit: multi-commit)
- [x] `extension/sidepanel/panel.html`
- [x] `extension/sidepanel/panel.js`
- [x] `extension/sidepanel/tabs/analyze-tab.html` / `analyze-tab.js`
- [x] 분석 결과 카드 UI — score-card / progress-bar / comparison-card 컴포넌트

## Phase 4: 벤치마킹 (신규 핵심)

### 4.1 즐겨찾기 블로거 관리 (commit: multi-commit)
- [x] `extension/sidepanel/tabs/benchmark-tab.html` / `benchmark-tab.js`
- [x] `extension/lib/repositories/benchmark-repo.js`
- [x] 블로그 URL 추가/제거 UI
- [~] Realtime 구독 (다기기 동기화) — 구현 여부는 benchmark-repo.js 확인 필요

### 4.2 자동 글 수집 (commit: multi-commit)
- [x] `extension/background/handlers/benchmark-handler.js`
- [x] 네이버 블로그 RSS 수집 (`collectors/naver-rss-collector.js`) + HTML 스크래핑 (`collectors/naver-html-scraper.js`)
- [x] benchmark_posts 캐싱
- [x] 정기 동기화 (`schedulers/benchmark-sync.js` — alarms API)

### 4.3 통계/비교 뷰 (commit: multi-commit)
- [x] 평균 글자수, 이미지수, 점수 차트 (`components/bar-chart.js`)
- [x] 키워드 워드클라우드 (`components/word-cloud.js`)
- [x] 내 글 vs 경쟁 글 비교 (`components/comparison-card.js` + `benchmark-stats-section.js`)

## Phase 5: AI 글 생성

### 5.1 Edge Function (commit: multi-commit)
- [x] `supabase/functions/generate-content/index.ts` (Gemini 2.5 Flash 호출)
- [x] `supabase/functions/_shared/gemini.ts` (프롬프트 주입 방어 fence)
- [x] `supabase/functions/_shared/auth.ts` / `usage.ts` / `generate-content/cors.ts`
- [x] 사용량 체크 + usage_logs 기록 (Gemini 호출 전 쿼터 검증)
- [x] 에러 처리 (rate_limit / quota_exceeded / invalid_key / upstream_error)

### 5.2 클라이언트 (commit: multi-commit)
- [x] `extension/sidepanel/tabs/generate-tab.html` / `generate-tab.js`
- [x] `extension/background/handlers/generate-handler.js`
- [x] 옵션 UI (독창성 슬라이더, 길이, 추가 요청, 학습 데이터 참조)
- [x] 결과 표시 (`components/generate-result-card.js`) + 안전한 클립보드 복사 (`extension/lib/utils/clipboard.js`)

## Phase 6: YouTube 변환 (commit: multi-commit)

- [x] `supabase/functions/extract-youtube/index.ts`
- [x] `supabase/functions/_shared/youtube.ts` (ytInitialPlayerResponse 파싱 — 타사 라이브러리 미사용)
- [x] `supabase/functions/_shared/blog-transform.ts` (자막 → 블로그 Gemini 변환)
- [x] 클라이언트 통합 — `extension/sidepanel/tabs/youtube-tab.html` / `youtube-tab.js` + `handlers/youtube-handler.js`
- [x] "생성 탭으로 보내기" 연계

## Phase 7: 학습 엔진 (commit: multi-commit)

- [x] `extension/lib/repositories/learning-repo.js`
- [x] "분석 + 학습" 옵션 → learning_data INSERT (analyzer.js 의 saveToLearning 경로, ownContent 게이트)
- [x] 글 생성 시 학습 데이터 컨텍스트 포함 (`extension/lib/analyzers/learning-context.js`)
- [x] `extension/background/handlers/learning-handler.js`
- [x] `extension/sidepanel/tabs/learning-tab.html` / `learning-tab.js`
- [x] `extension/sidepanel/components/learning-card.js`

## Phase 8: 마이페이지 + 결제

### 8.1 마이페이지 (commit: multi-commit)
- [x] `extension/mypage/mypage.html` / `mypage.js` / `mypage.css`
- [x] `extension/sidepanel/tabs/mypage-tab.html` / `mypage-tab.js` (사이드패널 내 미니 버전)
- [x] 사용량 대시보드 (`components/usage-gauge.js`)
- [x] 만료 알림 배너 (`components/expiry-banner.js` — 3일 전 / 1일 전)
- [x] `extension/lib/repositories/subscription-repo.js`

### 8.2 결제 연동 (commit: multi-commit)
- [x] 결제 게이트웨이 결정 — 토스 + 포트원 병행 지원
- [x] `supabase/functions/verify-subscription/index.ts` (webhook)
- [x] `supabase/functions/_shared/toss.ts` / `portone.ts` / `webhook-sig.ts`
- [x] 결제 페이지 (`extension/payments/checkout.html` / `checkout.js`)
- [x] subscriptions 테이블 기록 + plan 자동 업데이트 (`supabase/migrations/007_payment_triggers.sql` — DB 트리거로 자동 동기화)

## Phase 9: 부가 기능 (commit: multi-commit)

- [x] 글자수 카운터 (`extension/sidepanel/tools/char-counter.js`)
- [x] 뽀모도로 타이머 (`extension/sidepanel/tools/pomodoro.js` + `handlers/pomodoro-handler.js`)
- [x] 금칙어 체크 (`extension/sidepanel/tools/forbidden-words.js`)
- [x] 캡처 도구 (`extension/sidepanel/tools/screenshot.js` + `content/screenshot-overlay.js`)
- [x] `extension/sidepanel/tabs/tools-tab.html` / `tools-tab.js` — tools 허브

## Phase 10: 다국어 (commit: multi-commit)

- [x] `extension/_locales/ko/messages.json` (140 keys)
- [x] `extension/_locales/en/messages.json` (140 keys — 전문 번역 검수 TODO)
- [x] `extension/_locales/ja/messages.json` (140 keys — 전문 번역 검수 TODO)
- [x] `extension/lib/utils/i18n.js` — chrome.i18n 래퍼 + 런타임 locale 전환
- [x] manifest.json `default_locale: "ko"`
- [~] 모든 하드코딩 텍스트 → i18n key 로 교체 — auth/*.html, panel.html, youtube-tab.html, auth-error-map.js 완료. 나머지 tab/component JS 는 Phase 10.2 로 이월 (key 등록 완료)

## Phase 11: 관리자 (commit: multi-commit)

- [x] 관리자 페이지 (Supabase Auth + is_admin 플래그) — `extension/admin/admin.html` / `admin.js` / `admin.css`
- [x] `extension/admin/tabs/users.js` (유저 목록, 사용량, 플랜 수동 변경)
- [x] `extension/admin/tabs/settings.js` (app_settings 편집)
- [x] `extension/admin/tabs/banwords.js` (금칙어 관리)
- [x] `extension/admin/tabs/audit.js` (감사 로그)
- [x] `extension/lib/repositories/admin-repo.js`
- [x] `supabase/functions/admin-actions/index.ts` (service_role 기반 권한 작업)
- [x] `supabase/migrations/008_admin_audit.sql` (admin_audit_logs 테이블)

## Phase 12: 배포 준비

- [ ] 프로덕션 빌드 스크립트 (console.log 제거, ES Module 번들링) — `scripts/` 비어 있음
- [ ] 개인정보 처리방침 페이지 — `docs/` 비어 있음
- [ ] Chrome Web Store 등록 자료
- [ ] 스크린샷, 프로모 이미지
- [ ] 실제 아이콘 PNG (현재 `icons/README.md` 만 존재)
- [ ] `supabase db push` 운영 배포 + Secrets 설정
- [ ] `supabase functions deploy` (4개 Edge Function)

---

## 감사 결과 요약 (2026-04-14)

| Phase | 상태 | 비고 |
|-------|------|------|
| 1.1 | ✅ 완료 | |
| 1.2 | ✅ 완료 | BLOCKER 2 + HIGH 5 해소 (QA 리포트 1.2 참조) |
| 1.3 | ✅ 완료 | |
| 2.1 | ✅ 완료 | QA 2.1 해소 |
| 2.2 | ✅ 완료 | |
| 3.1 / 3.2 / 3.3 | ✅ 완료 | |
| 4.1 / 4.2 / 4.3 | ✅ 완료 | Realtime 구독은 코드 레벨 확인 필요 |
| 5.1 / 5.2 | ✅ 완료 | |
| 6 | ✅ 완료 | |
| 7 | ✅ 완료 | |
| 8.1 / 8.2 | ✅ 완료 | 결제 트리거 자동 동기화 포함 |
| 9 | ✅ 완료 | |
| 10 | ⚠️ 부분 완료 | 인프라/HTML 완료, 탭/컴포넌트 JS 는 후속 (key 전원 등록) |
| 11 | ✅ 완료 | |
| 12 | ❌ 미착수 | 배포 준비 작업 남음 — `_workspace/remaining_work.md` P0 |

상세: `_workspace/12_audit_summary.md`, `_workspace/file_inventory.md`, `_workspace/remaining_work.md`

---

## 작업 분담 가이드 (tmux)

세션 1 (Backend): Phase 1.1 → 1.2 → 5.1 → 6 → 8.2 (Edge Functions)
세션 2 (Auth): Phase 2 (1.3 완료 후)
세션 3 (분석): Phase 3 → 7 (1.3 완료 후)
세션 4 (벤치마킹): Phase 4 (3 완료 후)
세션 5 (AI 생성 UI): Phase 5.2 (5.1 완료 후)
세션 6 (마이페이지/결제): Phase 8

## 진행 상황 표기 예시

- `[x] 1.1 Supabase 프로젝트 셋업 (commit: abc1234)`
- `[in_progress @session-2] 2.1 로그인 페이지`

## 일일 동기화

매일 작업 시작 시:
1. 이 파일 최신화 확인
2. 자기 작업과 충돌 가능한 다른 진행 작업 확인
3. 막힌 작업 있으면 BLOCKED 마킹 + 이유 기록
