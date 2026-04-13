# BLOG BenchMarker - 기존 코드 참고 매핑

기존 프로젝트: `/Users/seok/AI PROJECT/확장프로그램/BLOG BOOSTER/blog-booster-pro/`

각 기능 구현 시 아래 위치를 **참고**하되, 새 아키텍처(Supabase, repository 패턴, XSS 방지)에 맞게 **재작성**하세요. 절대 그대로 복붙 금지.

## 1. SEO 분석

| 신규 위치 | 기존 참고 위치 | 비고 |
|---|---|---|
| `extension/lib/analyzers/seo-analyzer.js` | `lib/naver-seo-analyzer.js` | 점수 계산 로직 |
| `extension/lib/analyzers/nlp-utils.js` | `lib/nlp-utils.js` | 형태소/문장 분석 |
| `extension/lib/analyzers/hook-detector.js` | `content/analyzer.js:469-489` | **개선 필요**: false positive 많음 |
| `extension/content/extractor.js` | `content/extractor.js` | 네이버 DOM 파싱 |
| `extension/content/analyzer.js` | `content/analyzer.js` | UI 통합 |

## 2. 네이버 블로그 글쓰기 페이지 사이드바

| 신규 위치 | 기존 참고 위치 |
|---|---|
| `extension/content/sidebar-injector.js` | `content/blog-helper.js:1031-1430` (`createAnalysisSidebar`) |
| `extension/content/content.css` | `content/content.css` |

기존 사이드바는 좋은 참고. 다만 2000줄 단일 파일이라 분리 필요.

## 3. AI 글 생성

| 신규 위치 | 기존 참고 위치 | 비고 |
|---|---|---|
| `supabase/functions/generate-content/index.ts` | `background/service-worker.js:780-1240` | **재설계 필수** - 키 보호 위해 서버로 |
| `extension/sidepanel/tabs/generate-tab.js` | `sidepanel/panel.js` (생성 관련 부분) | UI만 참고 |
| 프롬프트 템플릿 | `background/service-worker.js`의 prompt 변수들 | 재사용 가능 |

## 4. 학습 엔진

| 신규 위치 | 기존 참고 위치 |
|---|---|
| `extension/lib/repositories/learning-repo.js` | `lib/learning-engine.js` |
| (학습 데이터 활용) | `background/service-worker.js`의 학습 컨텍스트 주입 부분 |

## 5. YouTube 변환

| 신규 위치 | 기존 참고 위치 |
|---|---|
| `supabase/functions/extract-youtube/index.ts` | `background/service-worker.js`의 YouTube 처리 부분 |

## 6. 사용량/구독 체크

| 신규 위치 | 기존 참고 위치 | 비고 |
|---|---|---|
| `extension/lib/repositories/usage-repo.js` | `background/service-worker.js:1500-1706` | **재설계** - Supabase RLS로 단순화 |
| `extension/lib/repositories/user-repo.js` (plan 체크) | `background/service-worker.js:1645-1706` | 토큰 갱신 수동 처리 불필요 |

## 7. 인증

| 신규 위치 | 기존 참고 위치 | 비고 |
|---|---|---|
| `extension/auth/login.html` | `auth/login.html` | UI 구조 참고 |
| `extension/auth/login.js` | `auth/login.js` | **로그아웃 자동 재로그인 버그 있음 - 재설계** |
| `extension/lib/supabase-client.js` | `lib/firebase-config.js` | 완전 재작성 |

## 8. 마이페이지

| 신규 위치 | 기존 참고 위치 |
|---|---|
| `extension/mypage/mypage.html` | `mypage/mypage.html` |
| `extension/mypage/mypage.js` | `mypage/mypage.js` |

## 9. 관리자

| 신규 위치 | 기존 참고 위치 | 비고 |
|---|---|---|
| 관리자 페이지 | `admin/admin.html`, `admin/admin.js` | **비밀번호 하드코딩 제거**, Supabase Auth + is_admin 플래그로 |

## 10. 매니페스트 / 권한

| 신규 위치 | 기존 참고 위치 |
|---|---|
| `extension/manifest.json` | `manifest.json` |

기존 manifest 검토 후 최소 권한만 유지.

## 11. 클립보드 복사

기존 `sidepanel/panel.js:2077-2080`은 실패 케이스를 제대로 처리 안 함.
**신규 `extension/lib/utils/clipboard.js`는**:
- navigator.clipboard 시도
- 실패 시 textarea + execCommand 폴백
- 두 방법 다 실패 시에만 에러 메시지

## 12. UI 컴포넌트 (CSS)

기존 `sidepanel/panel.css` 디자인은 유지해도 좋음. 다만:
- CSS 변수로 색상 체계화 (다크모드 대응)
- 다국어 시 텍스트 길이 변동 고려한 레이아웃

## 절대 가져오지 말 것

- `lib/firebase-*.js` (Firebase SDK 전체)
- `lib/firebase-config.js` (Firebase 의존)
- `lib/env-config.js` (실제 키 — 새 프로젝트는 자체 키 발급)
- `background/service-worker.js`의 메시지 라우터 구조 (50+ case switch는 안티패턴)
- 관리자 비밀번호 하드코딩 패턴

## 기존 코드의 알려진 버그 (재현 금지)

1. **토큰 만료 시 PRO 인식 실패** (`service-worker.js:1536-1544`)
   → Supabase SDK가 자동 처리하므로 해결됨

2. **로그아웃 후 자동 재로그인** (`auth/login.js:41-46`)
   → onAuthStateChanged 리스너 vs loggedOut 플래그 경쟁 상태
   → Supabase는 signOut() await 후 명시적 redirect

3. **클립보드 실패 알림 오작동** (`sidepanel/panel.js:2077-2080`)
   → navigator.clipboard Promise 처리 누락
   → utils/clipboard.js에서 깔끔하게 해결

4. **첫 문장 후킹 false positive** (`content/analyzer.js:469-489`)
   → 단순 키워드 매칭. AI 분류 또는 정교한 정규식 필요

5. **innerHTML XSS 가능성** (`sidepanel/panel.js` 다수)
   → utils/dom-safe.js 헬퍼 사용 강제
