---
name: legacy-port-guide
description: blog-booster-pro 기존 코드 참고·포팅 시 반드시 사용. "blog-booster-pro 참고", "기존 코드", "legacy 포팅", "이전 프로젝트", "firebase 제거", "Supabase로 마이그레이션", "REFERENCE.md"가 언급되면 로드한다. 후속 트리거: "기존과 비교", "어디에 있었지", "기존 로직 가져와". 재사용 허용 범위·금지 항목·알려진 버그 재현 금지 체크를 제공한다.
---

# Legacy Port Guide — blog-booster-pro → BLOG BenchMarker

## 이 스킬이 전달하는 것

`extension-core`, `ui-builder`, `analyzer-specialist` 에이전트가 기존 `blog-booster-pro/` 코드를 참고할 때의 **포팅 규칙·재사용 허용 범위·금지 목록·알려진 버그 체크**. 세부 매핑은 프로젝트의 `REFERENCE.md` 참조.

## 1. 핵심 원칙

### 1-1. 참고만, 복붙 절대 금지
기존 프로젝트 위치: `/Users/seok/AI PROJECT/확장프로그램/BLOG BOOSTER/blog-booster-pro/`

이 코드는 **Read만** 허용. 수정·이동·삭제 금지. 새 프로젝트 아키텍처에 맞게 **재작성**한다.

**이유:**
- 기존 코드는 Firebase·50+ case switch 안티패턴·innerHTML XSS·하드코딩 비밀번호 등이 엉켜 있다
- 복붙 시 새 프로젝트에 버그·부채가 전이된다
- Supabase·RLS·repository 패턴·MV3 최소 권한으로 전환해야 하므로 구조 자체가 다르다

### 1-2. CLAUDE.md의 절대 금지 재확인
- 기존 `blog-booster-pro` 폴더 **수정** 금지
- Firebase SDK 사용 금지
- API 키 하드코딩 금지
- innerHTML로 사용자 입력 렌더 금지
- 관리자 비밀번호 하드코딩 금지

## 2. 절대 가져오지 말 것

| 항목 | 경로 | 사유 |
|---|---|---|
| Firebase SDK 전체 | `lib/firebase-*.js` | Supabase로 대체 |
| 기존 env-config 실제 값 | `lib/env-config.js` | 새 프로젝트는 자체 키 발급 |
| 50+ case switch 라우터 | `background/service-worker.js`의 action 분기 | handler 맵 패턴으로 전환 |
| 관리자 비밀번호 하드코딩 | `admin/admin.js` | Supabase Auth + is_admin 플래그로 대체 |
| 로컬 프로모션 코드 | 관련 파일 | DB 기반 캠페인 시스템으로 전환 |

## 3. 재사용 판별 기준

### 3-1. 재사용 OK (그대로 또는 소폭 수정)
- **AI 프롬프트 템플릿:** `background/service-worker.js:780-1240`의 prompt 문자열들 → Edge Function에서 활용
- **SEO 점수 공식 아이디어:** `lib/naver-seo-analyzer.js`의 구성 요소·가중치 → 단, 구현은 결정적·순수 함수로 재작성
- **CSS 디자인 토큰 일부:** `sidepanel/panel.css`의 색상·간격 → CSS 변수로 재구성
- **형태소 처리 접근법:** `lib/nlp-utils.js`의 조사·불용어 아이디어 → `seo-analyzer-rules` 스킬 기준으로 재작성

### 3-2. 재작성 필수
- **인증 흐름:** Firebase → Supabase (SDK 자체가 다름)
- **Storage 접근:** Firestore → PostgreSQL + RLS
- **Service Worker 라우터:** switch → handler 맵
- **사용량 체크:** `service-worker.js:1500-1706` → Edge Function + RLS로 대폭 단순화 (클라이언트 JWT 수동 갱신 불필요)
- **사이드바 UI:** `content/blog-helper.js:1031-1430` (2000줄 단일 파일) → `extension/content/sidebar-injector.js` + 헬퍼 분리
- **분석 탭 UI:** `sidepanel/panel.js`의 innerHTML 다수 → dom-safe.js 경유 재구현

## 4. 알려진 버그 — 재현 금지

REFERENCE.md의 "기존 코드의 알려진 버그" 5개를 체크리스트로 관리.

### 4-1. 토큰 만료 시 PRO 인식 실패
- **기존 위치:** `service-worker.js:1536-1544`
- **원인:** 수동 JWT 갱신 로직 + 타이머 관리 실패
- **새 구현:** Supabase SDK가 자동 갱신. 수동 로직 넣지 말 것. `autoRefreshToken: true` 기본.

### 4-2. 로그아웃 후 자동 재로그인
- **기존 위치:** `auth/login.js:41-46`
- **원인:** `onAuthStateChanged` 리스너 vs 로그아웃 플래그의 경쟁 상태
- **새 구현:** `await supabase.auth.signOut()` → storage clear → 명시적 redirect. 리스너는 의도적 로그아웃 플래그 체크 후 행동. `chrome-extension-security` 스킬 5-3 참조.

### 4-3. 클립보드 실패 알림 오작동
- **기존 위치:** `sidepanel/panel.js:2077-2080`
- **원인:** `navigator.clipboard` Promise 처리 누락, 폴백 없음
- **새 구현:** `lib/utils/clipboard.js`의 폴백 체인(navigator.clipboard → textarea + execCommand → 실패 알림). `chrome-extension-security` 스킬 6 참조.

### 4-4. 첫 문장 후킹 false positive
- **기존 위치:** `content/analyzer.js:469-489`
- **원인:** 단순 키워드 매칭으로 도입부 대부분을 오판
- **새 구현:** 정규식 + 문맥 규칙 + confidence 점수. `seo-analyzer-rules` 스킬 3 참조.

### 4-5. innerHTML XSS 가능성
- **기존 위치:** `sidepanel/panel.js` 다수
- **원인:** 블로그 추출 데이터·사용자 입력을 innerHTML로 렌더
- **새 구현:** `lib/utils/dom-safe.js` 헬퍼 강제. `grep -rn "innerHTML" extension/`은 항상 0건. `chrome-extension-security` 스킬 3 참조.

## 5. 포팅 워크플로우

새 기능을 구현하기 전 다음 순서를 따른다:

1. **REFERENCE.md 확인** — 해당 기능의 기존 위치 매핑 찾기
2. **기존 파일 Read** (수정·이동 금지 — 절대 금지). 로직·의도 파악
3. **새 아키텍처 설계** — Supabase·repository·dom-safe에 맞게
4. **재작성 (복붙 아님)** — 기존 코드를 보지 않고 새로 작성하거나, 보더라도 구조를 바꿔 옮김
5. **5개 버그 재현 방지 체크** — 위 4-1 ~ 4-5 해당 시 특별 주의
6. **security-qa 검증 요청** — 경계면 shape·보안 규칙 준수 확인

## 6. 참고 매핑 핵심 (전체는 REFERENCE.md)

| 기능 | 신규 위치 | 기존 참고 |
|---|---|---|
| SEO 분석 로직 | `extension/lib/analyzers/seo-analyzer.js` | `lib/naver-seo-analyzer.js` |
| 형태소·문장 | `extension/lib/analyzers/nlp-utils.js` | `lib/nlp-utils.js` |
| hook 감지 | `extension/lib/analyzers/hook-detector.js` | `content/analyzer.js:469-489` (개선 필수) |
| 네이버 DOM 파싱 | `extension/content/extractor.js` | `content/extractor.js` |
| 글쓰기 사이드바 | `extension/content/sidebar-injector.js` | `content/blog-helper.js:1031-1430` |
| Gemini 호출 | `supabase/functions/generate-content/` | `background/service-worker.js:780-1240` |
| 프롬프트 | (위 Edge Function 내부) | 같은 범위의 prompt 변수들 |
| 학습 엔진 | `extension/lib/repositories/learning-repo.js` | `lib/learning-engine.js` |
| YouTube | `supabase/functions/extract-youtube/` | `service-worker.js`의 YouTube 부분 |
| 사용량 체크 | `extension/lib/repositories/usage-repo.js` + Edge Function | `service-worker.js:1500-1706` |
| 인증 | `extension/auth/login.{html,js}` | `auth/login.{html,js}` |
| 마이페이지 | `extension/mypage/` | `mypage/` |
| Manifest | `extension/manifest.json` | `manifest.json` (최소 권한 재검토) |

## 7. 자주 하는 실수

| 실수 | 증상 | 대응 |
|---|---|---|
| 기존 Firebase 초기화 그대로 포팅 | 번들에 firebase-* 잔존 | `grep firebase extension/` 0건 확인 |
| 기존 service-worker.js 구조 그대로 | switch case 50+ 유지 | handler 맵 패턴 강제 |
| 기존 innerHTML 복사 | XSS 취약 | `grep innerHTML extension/` 0건 |
| 기존 프롬프트에 API 키 포함된 문자열 혼재 | 키 노출 | 프롬프트만 분리해서 포팅 |
| 기존 관리자 비밀번호 체크 흉내 | 하드코딩 재현 | is_admin 플래그만 사용 |
| 수동 토큰 갱신 로직 포팅 | 경쟁 상태 재발 | Supabase SDK 자동 갱신 신뢰 |

## 8. WHY

- **왜 복붙 금지인가:** 기존 코드는 Firebase·안티패턴·버그가 엉켜 있다. 복붙하면 새 프로젝트에서도 같은 부채를 상속. 시간이 지날수록 제거 비용 증가.
- **왜 REFERENCE.md를 거쳐야 하는가:** 어디에 뭐가 있는지 찾는 시간을 절약하고, 새/구 매핑을 추적 가능한 형태로 유지하기 위해.
- **왜 5개 버그를 명시적으로 체크하는가:** "알려진 버그"는 반드시 다시 나타난다. 특히 같은 도메인을 옮길 때. 체크리스트로 관리해야 무의식적 재현을 막는다.

## 9. 자가 점검 체크리스트 (포팅 완료 후)

- [ ] `grep -r firebase extension/` → 0건
- [ ] `grep -rn innerHTML extension/` → 0건
- [ ] `grep -rE "AIza|sk_live|GEMINI_API_KEY\s*=" extension/` → 0건
- [ ] `grep -n "admin.*password.*=" extension/` → 0건 (관리자 비번 하드코딩 없음)
- [ ] Service Worker에 switch-case 30+ 없음
- [ ] 사용량 체크 로직이 Edge Function에도 존재 (클라이언트만이 아님)
- [ ] `extension/auth/login.js`에 명시적 signOut → clear → redirect 흐름 있음
- [ ] hook-detector가 confidence 점수 반환 (단순 boolean 아님)

## 10. 참고 스킬

- 확장 보안: `chrome-extension-security`
- SEO 개선 규칙: `seo-analyzer-rules`
- 배포 전 검증: `boundary-qa`
- 전체 매핑 표: 프로젝트 `REFERENCE.md`
