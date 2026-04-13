# BLOG BenchMarker - 작업 체크리스트

병렬 작업 가능하도록 분할. 작업 시작 시 `[ ]` → `[in_progress @세션이름]`, 완료 시 `[x]` + 커밋 해시.

## Phase 1: 기반 구축 (순차 진행 권장)

### 1.1 Supabase 프로젝트 셋업
- [x] Supabase 새 프로젝트 생성 (trainermilestone-blogbenchmarker, NANO plan)
- [x] 환경 변수 정리 (SUPABASE_URL, SUPABASE_ANON_KEY=Publishable key) — extension/lib/env-config.js 작성 완료
- [x] `lib/env-config.example.js` 작성 (extension/lib/env-config.example.js, Publishable key 포맷 반영)
- [x] `.gitignore`에 `lib/env-config.js` 추가 (프로젝트 루트 .gitignore)

### 1.2 DB 스키마 + RLS
- [ ] `supabase/migrations/001_users.sql` (profiles 테이블 + auth 트리거)
- [ ] `supabase/migrations/002_learning_data.sql`
- [ ] `supabase/migrations/003_benchmarks.sql` (benchmark_blogs + benchmark_posts)
- [ ] `supabase/migrations/004_usage_logs.sql`
- [ ] `supabase/migrations/005_settings.sql` (app_settings, subscriptions)
- [ ] `supabase/migrations/006_rls.sql` (모든 RLS 정책)
- [ ] `supabase db push`로 적용 + 검증

### 1.3 확장프로그램 골격
- [ ] `extension/manifest.json` 작성 (Manifest V3, 필요 권한만)
- [ ] `extension/lib/supabase-client.js` (chrome.storage adapter 포함)
- [ ] `extension/background/service-worker.js` (메시지 라우터만)
- [ ] 기본 아이콘 + 사이드패널 스켈레톤

## Phase 2: 인증 (Phase 1 완료 후)

### 2.1 Supabase Auth 통합
- [ ] `extension/auth/login.html` (이메일/비밀번호 + Google OAuth)
- [ ] `extension/auth/login.js`
- [ ] `extension/lib/repositories/user-repo.js` (profile CRUD)
- [ ] 회원가입 시 profiles 자동 생성 트리거 (DB 트리거 또는 클라이언트)
- [ ] 이메일 인증 플로우
- [ ] 비밀번호 재설정

### 2.2 권한/세션 관리
- [ ] `extension/background/handlers/auth-handler.js`
- [ ] 세션 갱신 자동화 검증 (Supabase SDK가 처리)
- [ ] 로그아웃 시 storage 완전 정리 + 자동 재로그인 방지

## Phase 3: 핵심 분석 기능 (Phase 1 완료 후, 2와 병렬 가능)

### 3.1 SEO 분석
- [ ] `extension/lib/analyzers/seo-analyzer.js` (참고: REFERENCE.md)
- [ ] `extension/lib/analyzers/nlp-utils.js`
- [ ] `extension/lib/analyzers/hook-detector.js` (개선판 - 정규식 보강)
- [ ] `extension/content/extractor.js` (네이버 블로그 DOM 파싱)
- [ ] `extension/content/analyzer.js` (점수 계산)

### 3.2 글쓰기 페이지 사이드바
- [ ] `extension/content/sidebar-injector.js`
- [ ] `extension/content/content.css`
- [ ] 실시간 분석 (debounce)

### 3.3 사이드패널 분석 탭
- [ ] `extension/sidepanel/panel.html`
- [ ] `extension/sidepanel/tabs/analyze-tab.js`
- [ ] 분석 결과 카드 UI (innerHTML 금지, DOM API 사용)

## Phase 4: 벤치마킹 (신규 핵심)

### 4.1 즐겨찾기 블로거 관리
- [ ] `extension/sidepanel/tabs/benchmark-tab.js`
- [ ] `extension/lib/repositories/benchmark-repo.js`
- [ ] 블로그 URL 추가/제거 UI
- [ ] Realtime 구독 (다기기 동기화)

### 4.2 자동 글 수집
- [ ] `extension/background/handlers/benchmark-handler.js`
- [ ] 네이버 블로그 RSS 또는 스크래핑
- [ ] benchmark_posts 캐싱
- [ ] 정기 동기화 (alarm API)

### 4.3 통계/비교 뷰
- [ ] 평균 글자수, 이미지수, 점수 차트
- [ ] 키워드 워드클라우드 (간단 버전)
- [ ] 내 글 vs 경쟁 글 비교

## Phase 5: AI 글 생성

### 5.1 Edge Function
- [ ] `supabase/functions/generate-content/index.ts` (Gemini 호출)
- [ ] 사용량 체크 + usage_logs 기록
- [ ] 에러 처리 (rate limit, 키 만료 등)

### 5.2 클라이언트
- [ ] `extension/sidepanel/tabs/generate-tab.js`
- [ ] `extension/background/handlers/generate-handler.js`
- [ ] 옵션 UI (독창성, 길이, 추가 요청)
- [ ] 결과 표시 + 안전한 클립보드 복사 (`extension/lib/utils/clipboard.js`)

## Phase 6: YouTube 변환

- [ ] `supabase/functions/extract-youtube/index.ts`
- [ ] 클라이언트 통합

## Phase 7: 학습 엔진

- [ ] `extension/lib/repositories/learning-repo.js`
- [ ] "분석 + 학습" 옵션 → learning_data INSERT
- [ ] 글 생성 시 학습 데이터 컨텍스트 포함

## Phase 8: 마이페이지 + 결제

### 8.1 마이페이지
- [ ] `extension/mypage/mypage.html`
- [ ] `extension/mypage/mypage.js`
- [ ] 사용량 대시보드
- [ ] 만료 알림 배너 (3일 전, 1일 전)

### 8.2 결제 연동
- [ ] 결제 게이트웨이 결정 (토스 vs 포트원)
- [ ] `supabase/functions/verify-subscription/index.ts` (webhook)
- [ ] 결제 페이지 (외부 호스팅 또는 확장프로그램 내)
- [ ] subscriptions 테이블 기록 + plan 자동 업데이트

## Phase 9: 부가 기능

- [ ] 글자수 카운터 (글쓰기 페이지)
- [ ] 뽀모도로 타이머
- [ ] 금칙어 체크
- [ ] 캡처 도구 (html2canvas)

## Phase 10: 다국어

- [ ] `_locales/ko/messages.json`
- [ ] `_locales/en/messages.json`
- [ ] `_locales/ja/messages.json`
- [ ] `extension/lib/utils/i18n.js`
- [ ] 모든 하드코딩 텍스트 → i18n key로 교체

## Phase 11: 관리자

- [ ] 관리자 페이지 (Supabase Auth + is_admin 플래그)
- [ ] 유저 목록, 사용량, 플랜 수동 변경
- [ ] app_settings 편집

## Phase 12: 배포 준비

- [ ] 프로덕션 빌드 스크립트 (console.log 제거)
- [ ] 개인정보 처리방침 페이지
- [ ] Chrome Web Store 등록 자료
- [ ] 스크린샷, 프로모 이미지

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
