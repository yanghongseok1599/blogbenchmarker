# 변경 이력 (Changelog) — BLOG BenchMarker

**마지막 업데이트: 2026-04-14**

본 문서는 BLOG BenchMarker 의 버전별 변경 사항을 기록합니다. 형식은 [Keep a Changelog](https://keepachangelog.com/ko/1.1.0/) 의 한국어 변형을 따르며, 버전은 [Semantic Versioning](https://semver.org/lang/ko/) 에 따릅니다.

각 릴리스 항목은 **Added(추가)** / **Changed(변경)** / **Deprecated(곧 제거)** / **Removed(제거)** / **Fixed(수정)** / **Security(보안)** 분류로 정리합니다.

---

## 목차

- [1.0.0 — 2026-04-14 (초기 릴리스)](#100--2026-04-14-초기-릴리스)
- [0.9.x — 내부 베타](#09x--내부-베타)
- [향후 릴리스 계획](#향후-릴리스-계획)

---

## 1.0.0 — 2026-04-14 (초기 릴리스)

Chrome Web Store 첫 공개 버전. 네이버 블로그 작성자를 위한 SEO 분석·벤치마킹·AI 글 생성의 3축이 완성된 릴리스입니다.

### Added

**SEO 분석 엔진**
- 100점 만점 5개 섹션 점수화(제목 최적화 20 + 콘텐츠 구조 30 + 후킹 15 + 가독성 20 + 키워드 밀도 15).
- 첫 문장 후킹 유형 자동 분류(질문/감탄/통계/스토리텔링/인사/알 수 없음).
- 한국어 개선 제안 최대 8개 자동 생성.
- 네이버 블로그 글쓰기 페이지에 Shadow DOM 기반 실시간 사이드바(800ms debounce) 주입.
- `Alt+B` 단축키로 사이드바 토글.

**경쟁 블로그 벤치마킹**
- 즐겨찾기 경쟁 블로그 관리(FREE 1개 · PRO 10개).
- 등록 시 최근 글 자동 수집, 이후 30분 간격 정기 동기화(`chrome.alarms`).
- 평균 글자수·이미지수·SEO 점수 집계 카드.
- SVG 기반 점수 분포 바 차트(5 bucket, `createElementNS` 전용).
- 자주 등장한 키워드 워드클라우드(5-bucket 폰트 사이즈, CSS Grid 배치).
- 내 글 vs 경쟁 글 "나란히 비교" 카드(delta 방향 색상 표시).
- Supabase Realtime 을 통한 다기기 즉시 동기화.

**AI 글 생성**
- Google Gemini `gemini-2.5-flash` 모델 기반.
- 길이 80% / 100% / 120% 및 모드(구조 유지 · 재해석 · 창작) 선택.
- 키워드·톤·역할·추가 요청 상세 옵션.
- 학습 데이터 컨텍스트 자동 주입(최근 5개).
- 생성 결과 클립보드 복사(폴백 체인 포함).
- Edge Function 으로 Gemini API 키 서버 측 보호.

**YouTube → 블로그 변환**
- `extract-youtube` Edge Function 을 통한 자막 추출.
- 추출된 자막을 블로그 형식 초안으로 재가공.
- FREE 일 3건 / PRO 일 30건 한도.

**인증 · 계정**
- 이메일·비밀번호 가입(8~72자, 영문+숫자).
- Google OAuth 로그인(state 파라미터 검증 + `chrome.identity.launchWebAuthFlow`).
- 이메일 인증 플로우, 비밀번호 재설정 메일.
- Supabase 세션을 `chrome.storage.local` 커스텀 어댑터로 지속화.

**마이페이지 · 플랜 관리**
- 독립 페이지(`mypage/mypage.html`) + 사이드패널 미니 탭 이원화.
- 프로필·플랜·사용량 대시보드(최근 30일 롤링).
- 기능별 사용 내역 테이블(호출 수 + 토큰 소비량).
- 월간 사용량 게이지(good/fair/warn/danger/unlimited 5단계).
- 만료 임박 배너(3일 노랑 · 1일 빨강), dismiss 시 `endsAt` 키 기반 재표시 보장.

**결제**
- 토스페이먼츠 · 포트원 webhook 연동(Edge Function `verify-subscription`).
- 다중 PG 사 대응을 위한 `(gateway, payment_id)` 복합 UNIQUE.
- 구독 상태 전이(`active` / `cancelled` / `expired` / `refunded`).

**글쓰기 보조 도구**
- 글자수 카운터(6 지표 실시간 + 한국어 500자/분 기준 읽기 시간).
- 뽀모도로 타이머(기본 25/5분, `chrome.alarms` 로 sidepanel 닫힘 내성, `chrome.notifications` 알림).
- 금칙어 검사(전역 `app_settings` + 사용자 정의, `matchAll` 기반 하이라이트).
- 스크린샷(전체·영역, `chrome.tabs.captureVisibleTab` + canvas 크롭, html2canvas 미사용).

**학습 엔진**
- 분석 + 학습 토글로 본인 글 컬렉션 축적(FREE 50개 · PRO 무제한).
- 학습 데이터를 AI 생성 프롬프트 컨텍스트로 자동 주입.
- 학습 탭에서 카드 목록 + 체크박스 삭제.

**다국어 지원 (Phase 10)**
- `_locales/{ko,en,ja}/messages.json`.
- `data-i18n` / `data-i18n-attr` 속성 기반 선언적 바인딩.
- `chrome.i18n.getMessage` 자동 폴백.

**보안 · 품질**
- MV3 기본 CSP 준수(`script-src 'self'; object-src 'self'`). 원격 스크립트 0건.
- `innerHTML` / `outerHTML` / `insertAdjacentHTML` 사용 0건(모든 UI 는 `dom-safe.js` 경유).
- Supabase Row Level Security 로 유저별 데이터 격리.
- Gemini · YouTube API 키는 Edge Function 전용(확장 번들 미노출).
- `chrome-extension://` CSP + Content Scripts Shadow DOM 이중 격리.

### Security

- OAuth 리다이렉트 하이재킹 방어용 state 파라미터 검증(`crypto.randomUUID` + `chrome.storage.session`).
- Supabase Auth 에러 메시지의 원문 노출 금지 — 사용자 친화 문구로 매핑(`auth-error-map.js`).
- 메시지 라우터의 `sender.id === chrome.runtime.id` 검증.
- 비밀번호 bcrypt 해싱(Supabase Auth 기본), 72자 상한 명시.

---

## 0.9.x — 내부 베타

내부 테스트용 비공개 빌드. Chrome Web Store 에 게시되지 않았습니다.

### 0.9.3 — 2026-04-12 (Phase 9 완료)
- 부가 도구 4종 도입(글자수·뽀모도로·금칙어·스크린샷).
- `notifications` / `tabs` 권한 최초 추가.

### 0.9.2 — 2026-04-10 (Phase 8 완료)
- 마이페이지 · 사용량 게이지 · 만료 배너.
- `web_accessible_resources` 최초 도입(`mypage/*` 노출).

### 0.9.1 — 2026-04-08 (Phase 4 완료)
- 벤치마킹 탭(통계/비교 뷰).
- `bar-chart` · `word-cloud` · `comparison-card` 컴포넌트.

### 0.9.0 — 2026-04-05 (Phase 3 완료)
- SEO 분석 엔진(`seo-analyzer.js`) 및 사이드바 주입.
- 공개 JSON 계약서(`analyzer_result_shape.md`) 확정.

---

## 향후 릴리스 계획

아래는 계획 중인 주요 변경이며, 일정과 내용은 변경될 수 있습니다.

### 1.1.0 (예정)
- Gemini BYOK(본인 API 키) UI 연동
- 분석 결과 PDF 내보내기
- 벤치마크 알림(경쟁 블로그 신규 글 감지 시 알림)

### 1.2.0 (예정)
- 영문·일문 블로그 플랫폼 지원 가능성 검토(WordPress / Tistory)
- 팀 계정(공유 벤치마크, 학습 데이터)

### 2.0.0 (장기)
- 관리자 대시보드 공개 베타
- 오픈 API(기업 플랜 대상 자동화)

---

## 버전 표기 규칙

- **MAJOR.MINOR.PATCH** (예: 1.0.0)
- **MAJOR:** 파괴적 변경(기존 API·계약 호환성 깨짐).
- **MINOR:** 하위 호환 기능 추가.
- **PATCH:** 하위 호환 버그 수정 및 보안 패치.
- 보안 긴급 패치는 MINOR 업데이트 중에도 별도 번호 부여(예: `1.0.1`).

릴리스 채널은 Chrome Web Store **stable** 단일 채널입니다. 베타 채널은 현재 계획이 없습니다.
