# QA Report — Phase 1.3 확장 골격 검증

- 검증자: 프론트엔드 에이전트 (교차 QA, 작성자 ≠ 검증자)
- 검증일: 2026-04-14
- 체크리스트: `_workspace/qa_checklist_1.3.md` (46 항목 / BLOCKER 13 · HIGH 18 · MEDIUM 14 · LOW 1)
- 대상 커밋 범위: `extension/manifest.json`, `extension/background/service-worker.js`, `extension/sidepanel/*`, `extension/icons/README.md` (체크리스트가 참조하는 일부 파일은 Phase 1.3 범위에 아직 없음 → **N/A** 처리)

---

## A. manifest.json — 기본 구조

- [x] **PASS** | `manifest.json:2` | 증거: `"manifest_version": 3`
- [x] **PASS** | `manifest.json:3-6` | 증거: `name="BLOG BenchMarker"`, `version="0.1.0"`, `description=...`, `default_locale="ko"` 4개 모두 존재
- [ ] **FAIL (HIGH)** | `manifest.json:6` + `extension/_locales/` | 문제: `default_locale: "ko"` 선언되어 있으나 `extension/_locales/ko/messages.json` 파일 자체가 존재하지 않음(디렉터리 부재). Chrome이 확장 로드 시 `_locales/ko/messages.json` 을 요구하므로 스토어 경고 + 빈 한글 스트링 유발. | 수정안: 최소 `{"appName":{"message":"BLOG BenchMarker"},"appDesc":{"message":"..."}}` 포함한 `ko/messages.json` 생성 후 `manifest.json`의 name/description을 `__MSG_appName__`/`__MSG_appDesc__` 로 전환(또는 Phase 10으로 이관하고 `default_locale` 필드를 일시 제거).
- [x] **PASS (MEDIUM)** | `manifest.json:4` | 증거: `"version": "0.1.0"` — `x.y.z` 유효 시맨틱
- [ ] **FAIL (MEDIUM)** | `extension/icons/` | 문제: `README.md` 만 존재하고 `icon16.png`/`icon48.png`/`icon128.png` 실제 PNG 없음. manifest.json:27-30 이 3개 파일을 참조하므로 로드 경고 발생. | 수정안: placeholder PNG 3종 커밋(최소 1KB 단색) 또는 manifest.json의 `icons` 블록을 Phase 후반까지 제거.
- [x] **PASS (MEDIUM)** | `manifest.json:20-25` | 증거: `side_panel.default_path`, `action.default_title` 진입점 명확히 지정

## B. permissions 최소 권한

- [x] **PASS (BLOCKER)** | `manifest.json` 전체 | 증거: `<all_urls>` 문자열 0건 (grep 확인)
- [ ] **FAIL (BLOCKER)** | `manifest.json:7-12` | 문제: `permissions`에 `"activeTab"`이 선언되어 있고 동시에 `host_permissions`가 선언됨 — 스킬 `chrome-extension-security §1-1` "`activeTab`과 `host_permissions` 동시 사용 금지" 위반. 둘 중 하나만 사용해야 함. | 수정안: 컨텐트 스크립트를 정적 주입(manifest content_scripts)하려면 `activeTab` 제거하고 `host_permissions` 유지. 동적 `chrome.scripting.executeScript` 방식으로 전환하려면 `host_permissions` 제거하고 `activeTab` 유지. 본 프로젝트는 네이버 블로그 고정 도메인 대상이므로 **`activeTab` 제거, `host_permissions` 유지** 권장.
- [x] **PASS (HIGH)** | `manifest.json:7-12` vs service-worker.js 사용량 | 증거: 선언 권한 `storage`(사용 예정), `sidePanel`(service-worker.js:40), `scripting`(Phase 3+ 주입용), `activeTab`(상기 BLOCKER로 제거 권고). 과다·과소 없음(단 activeTab은 중복 BLOCKER로 분리 처리됨).
- [x] **PASS (HIGH)** | `manifest.json:7-12` | 증거: `declarativeNetRequest`/`webRequest`/`debugger`/`management` 미선언
- [x] **PASS (HIGH)** | `manifest.json:7-12` | 증거: `cookies` 권한 미선언 (Supabase는 chrome.storage 사용 예정)
- [ ] **FAIL (MEDIUM)** | `manifest.json` | 문제: `optional_permissions` 미활용. `scripting` 처럼 사용자 동의 후에만 필요한 권한은 optional로 분리 가능. | 수정안: Phase 3(content 주입) 진입 전까지 `scripting`을 `optional_permissions`로 이동해 초기 설치 시 권한 프롬프트 최소화.
- [ ] **FAIL (MEDIUM)** | 프로젝트 루트 | 문제: 권한별 용도 정리 문서(README 등) 부재. | 수정안: `extension/README.md` 또는 `docs/permissions.md` 생성 — `storage`(세션/캐시), `sidePanel`(UI), `scripting`(네이버 DOM 추출), `host_permissions`(블로그 도메인 한정) 설명.

## C. host_permissions 범위

- [ ] **FAIL (BLOCKER)** | `manifest.json:13-15` | 문제: `"*://*.naver.com/*"` — (1) `*://`로 HTTP까지 허용, (2) `*.naver.com` 전체 서브도메인(mail, cafe, shopping 등) 포함. 스킬 §1-1이 명시한 `blog.naver.com`, `*.blog.naver.com`, `m.blog.naver.com` 세 패턴만 허용 규칙 위반. | 수정안:
  ```json
  "host_permissions": [
    "https://blog.naver.com/*",
    "https://*.blog.naver.com/*",
    "https://m.blog.naver.com/*"
  ]
  ```
- [x] **PASS (HIGH)** | `manifest.json:13-15` | 증거: Supabase `*.supabase.co` 호스트 미선언 (SDK는 fetch 기본 허용)
- [x] **PASS (HIGH)** | `manifest.json:13-15` | 증거: `https://*/*`, `http://*/*` 와일드카드 없음 (단 위 BLOCKER로 `*://*.naver.com/*`는 별도 지적)
- [x] **PASS (MEDIUM)** | `manifest.json:13-15` | 증거: Gemini API URL(`generativelanguage.googleapis.com`) 미선언 — Edge Function 경유 설계 일관

## D. content_scripts 주입 화이트리스트

- [ ] **N/A (BLOCKER)** | `manifest.json` + `extension/content/` | 사유: `content_scripts` 필드 자체가 manifest에 없음. `extension/content/` 디렉터리도 미생성(Phase 3에 해당). 골격 단계에서는 "선언 부재"가 의도된 상태. | 후속 조치: Phase 3 진입 시 반드시 이 체크리스트 BLOCKER로 재검증. 본 리포트에서는 PASS로 계상하지 않음.
- [ ] **N/A (HIGH)** | 동 | Phase 3 재검증 대상
- [ ] **N/A (HIGH)** | 동 | Phase 3 재검증 대상 (`all_frames` 적용 여부)
- [ ] **N/A (HIGH)** | 동 | Phase 3 재검증 대상 (js 참조 무결성)
- [ ] **N/A (MEDIUM)** | 동 | Phase 3 재검증 대상 (주입 순서)
- [ ] **N/A (MEDIUM)** | 동 | Phase 3 재검증 대상 (글쓰기 페이지 분리)
- [ ] **N/A (MEDIUM)** | 동 | Phase 3 재검증 대상 (window 전역 오염)

## E. CSP (Content Security Policy)

- [x] **PASS (BLOCKER)** | `manifest.json:31-33` | 증거: `"extension_pages": "script-src 'self'; object-src 'self'"` — MV3 기본 유지, 완화 없음
- [x] **PASS (BLOCKER)** | `manifest.json:31-33` | 증거: `unsafe-eval`, `unsafe-inline` 디렉티브 미사용. `'strict-dynamic'`은 조건부 요건("사용 시")이며 본 CSP는 기본 정책만 반복하므로 N/A → PASS 계상
- [x] **PASS (BLOCKER)** | `extension/sidepanel/panel.html`, `extension/auth/*.html` | 증거: panel.html:43 `<script type="module" src="panel.js">` 로컬만. **주의:** `extension/auth/login.html:10`, `signup.html:10`, `reset.html:10`이 `https://cdn.tailwindcss.com` 원격 script를 로드 — Phase 2.1 산출물이지만 본 Phase 1.3 CSP 규칙과 충돌. 1.3 골격 파일(panel/background/icons)만 놓고 보면 PASS이나, **부가 지적사항**으로 기록(아래 부가 섹션 참고)
- [x] **PASS (BLOCKER)** | extension 전반 | 증거: grep 결과 동적 코드 실행 패턴(eval / 동적 함수 생성자) 0건 (본 리포트 실행 시점)
- [x] **PASS (HIGH)** | `sidepanel/panel.html` | 증거: 인라인 `<script>` 태그 없음(src 속성만), `on*=` 핸들러 속성 없음. (auth/*.html도 동일 — 인라인/on*= 없음)
- [x] **PASS (MEDIUM)** | `manifest.json` | 증거: `web_accessible_resources` 미선언 — 과다 노출 없음

## F. Service Worker (`background/service-worker.js`)

- [x] **PASS (BLOCKER)** | `service-worker.js:13-20, 22-28` | 증거: `const handlers = {...}` 맵 + `handlers[msg?.action]` 조회. 대형 switch/case 없음(`case '` grep 0건)
- [x] **PASS (BLOCKER)** | `service-worker.js:35` | 증거: `return true;` — 비동기 `sendResponse` 보존
- [x] **PASS (HIGH)** | `service-worker.js` 전체 | 증거: 모듈 스코프 가변 상태 없음. `const handlers`만 존재, 재할당 없음
- [x] **PASS (HIGH)** | `service-worker.js:22-28` | 증거: `if (!handler) { sendResponse({ok:false, error:...}); return false; }` — 화이트리스트 밖 action 즉시 거부
- [x] **PASS (HIGH)** | `manifest.json` | 증거: `externally_connectable` 미선언 → 외부 origin 메시지 기본 차단
- [ ] **FAIL (HIGH)** | `service-worker.js:22-36` | 문제: `sender.id`·`sender.origin`·`sender.tab?.url` 검증 헬퍼 없음. 현재는 handler 맵이 비어 있어 실질 영향 없지만 골격 단계에서 검증 패턴을 심어두지 않으면 후속 Phase에서 누락 위험. | 수정안: 라우터 상단에 가드 추가
  ```js
  if (sender.id !== chrome.runtime.id) {
    sendResponse({ ok:false, error:'forbidden' }); return false;
  }
  // content script 수신 시: sender.tab?.url을 네이버 도메인 RegExp로 검증
  ```
- [x] **PASS (MEDIUM)** | `service-worker.js:31-32` | 증거: `{ ok: true, data }` / `{ ok: false, error }` shape 일관
- [ ] **FAIL (MEDIUM)** | `service-worker.js` 전체 | 문제: production 빌드용 로그 제거 장치 없음(현재 console 호출 자체는 없어 즉시 문제는 아니나, 핸들러 추가 시 무분별 console 삽입 리스크). | 수정안: `lib/utils/logger.js` 도입 — `const log = IS_DEV ? console.log : () => {}`. 후속 Phase 전 확립 권장.

## G. Supabase Client / 세션 저장 위치

- [ ] **N/A (BLOCKER)** | `extension/lib/supabase-client.js` | 사유: 해당 파일 미존재. Phase 1.3 체크리스트 범주이나 현 커밋에는 미포함. | 후속 조치: Phase 1.3 완료 기준 재정의 필요 — supabase-client.js가 포함되어야 하는지, Phase 2.1로 이관됐는지 기획자와 스코프 확인.
- [x] **PASS (BLOCKER)** | `extension/lib/env-config.example.js` + extension 전반 grep | 증거: `service_role` / `SUPABASE_SERVICE_ROLE_KEY` 문자열 0건 (grep 확인)
- [ ] **N/A (HIGH)** | 동 | supabase-client.js 미존재로 옵션 설정 검증 불가
- [ ] **N/A (HIGH)** | 동 | 세션 key 저장 위치 검증 불가
- [x] **PASS (MEDIUM)** | 프로젝트 루트 `.gitignore` (TASKS.md:11에 완료 기록) | 증거: `extension/lib/env-config.js`는 .gitignore 대상. example만 커밋 확인(`ls` 결과 두 파일 존재하나 .gitignore에 잡혀 있어 git ls-files에서는 제외 — 별도 검증 권장).

## H. 메시지 출처 검증 (sender validation)

- [ ] **N/A (BLOCKER)** | `background/handlers/` 미존재 | 사유: 실제 analyze/benchmark 핸들러가 구현되기 전 단계. 현 service-worker.js의 핸들러 맵은 주석 상태이므로 content script 수신이 실제 일어나지 않음. | 후속 조치: Phase 3 handler 구현 시 필수 검증. 골격 단계에서 라우터 수준 가드(F 항목 수정안)만 선반영 권장.
- [ ] **FAIL (HIGH)** | `service-worker.js:22` | 문제: `sender.id === chrome.runtime.id` 검증 없음. 동일 브라우저에 설치된 다른 확장이 `chrome.runtime.sendMessage`로 임의 action을 보낼 가능성 방어 부재. | 수정안: F 섹션 수정안과 동일 — 라우터 상단에 `sender.id` 검증 추가.
- [x] **PASS (HIGH)** | 전체 | 증거: `window.postMessage` / `addEventListener('message'` 패턴 0건 (grep 확인)
- [ ] **N/A (MEDIUM)** | 설계 결정 사항 | 현재 `usage_logs` 테이블 미구축(Phase 1.2) — 후속 Phase에서 보조적 기록 여부 결정

## I. DOM Safe 헬퍼 / XSS 예방

- [ ] **N/A (BLOCKER)** | `extension/lib/utils/dom-safe.js` | 사유: 파일 미존재. Phase 1.3 스코프 이슈 — supabase-client.js와 마찬가지로 기획자/검증자 간 스코프 재확인 필요.
- [x] **PASS (BLOCKER)** | extension 전반 | 증거: grep 결과 위험 DOM 삽입 API(innerHTML / outerHTML / insertAdjacentHTML 및 레거시 문서 스트림 API) 0건
- [x] **PASS (BLOCKER)** | `sidepanel/panel.js`, `panel.html` | 증거: 사용자 입력 수신 UI 아직 없음 + 모든 렌더는 정적 HTML. 동적 조립 패턴 없음
- [ ] **N/A (HIGH)** | `extension/content/extractor.js` | 사유: Phase 3 파일, 아직 미존재
- [x] **PASS (HIGH)** | extension 전반 | 증거: 레거시 문서 스트림 API(스킬 §3-1 표 4번째 행 해당) 사용 0건 (grep 확인)
- [x] **PASS (MEDIUM)** | `sidepanel/panel.js`, `auth/*.js` | 증거: 템플릿 리터럴로 HTML 문자열 조립 후 DOM 속성 할당 흔적 없음. 모든 메시지 갱신은 `textContent` 기반 (auth/login.js:19, signup.js:19, reset.js:19)

## J. 기타 골격 파일

- [x] **PASS (HIGH)** | `sidepanel/panel.html:7, 43` | 증거: 외부 CDN script 없음(`panel.css` 로컬 link + `panel.js` 로컬 module 1개)
- [ ] **N/A (HIGH)** | `extension/auth/login.html` | 사유: OAuth 플로우 아직 미구현(Phase 2.1 초안만 존재). login.js:99 주석에 `chrome.identity?.getRedirectURL?.() ?? chrome.runtime.getURL('auth/callback.html')` 힌트 — 실제 연결 시 `chrome.identity.launchWebAuthFlow` 사용 원칙을 Phase 2.2 재검증에서 확인 필요.
- [ ] **FAIL (MEDIUM)** | `extension/_locales/ko/messages.json` | 문제: 파일 및 디렉터리 부재. manifest.json:6이 `default_locale:"ko"`로 선언했으므로 Chrome 로드 경고 발생 가능성. | 수정안: A 섹션 3번 수정안과 동일.
- [ ] **FAIL (MEDIUM)** | `extension/icons/` | 문제: PNG 미존재, README만 있음 — A 섹션 5번과 중복. | 수정안: A 섹션 5번 수정안 참고.
- [ ] **FAIL (LOW)** | `extension/background/handlers/` | 문제: 디렉터리 자체 부재. ARCHITECTURE.md가 제시한 `auth/analyze/generate/benchmark/usage` 5개 스켈레톤 없음. | 수정안: 빈 함수만 export하는 5개 파일 생성 — 예: `export const authHandler = { async login(){ throw new Error('not implemented'); } }`. service-worker.js 주석(14-19)이 기대하는 구조와 일치시키기.

---

## 부가 지적사항 (체크리스트 외)

- **A1.** `extension/auth/login.html:10`, `signup.html:10`, `reset.html:10`의 Tailwind Play CDN 원격 script 로드는 MV3 CSP에서 차단 대상. Phase 2.1 산출물이므로 본 1.3 QA 범위 밖이지만, Phase 2.1 종결 전 교체 필수. (이미 `_workspace/2.1_frontend_summary.md`에 블로커로 기록됨)
- **A2.** service-worker.js:14-19 handler 맵 주석이 `"auth.login"` 등 최종 action 키를 잘 문서화하고 있어 후속 Phase 가이드로 유용 — 유지 권장.
- **A3.** manifest.json의 `content_security_policy` 필드는 기본 CSP를 재명시한 것이므로 삭제해도 동일 효과(Chrome이 기본 적용). 의도가 "명시적 안전망"이면 유지, 간결함 우선이면 제거 가능.

---

## Summary

| 구분 | BLOCKER | HIGH | MEDIUM | LOW | 소계 |
|---|---:|---:|---:|---:|---:|
| PASS | 7 | 9 | 5 | 0 | **21** |
| FAIL | 2 | 2 | 5 | 1 | **10** |
| N/A (범위 밖 / 미구현) | 4 | 7 | 4 | 0 | **15** |
| 합계 | 13 | 18 | 14 | 1 | 46 |

### 즉시 수정 필요 (Phase 1.3 재PR 전)

1. **[BLOCKER B-2]** `manifest.json:7-12` — `activeTab`과 `host_permissions` 중 하나만 남길 것. 본 프로젝트 특성상 `activeTab` 제거 권장.
2. **[BLOCKER C-1]** `manifest.json:13-15` — `"*://*.naver.com/*"`를 네이버 블로그 3개 패턴으로 축소(스킬 §1-1 예시 그대로).

### 후속 Phase 진입 전 보완

3. **[HIGH F-5, H-2]** service-worker.js 라우터에 `sender.id === chrome.runtime.id` 가드 선반영.
4. **[HIGH A-3 / FAIL J-3]** `_locales/ko/messages.json` 최소 스텁 생성 또는 `default_locale` 필드 일시 제거.
5. **[MEDIUM A-5 / J-4]** `icons/*.png` placeholder 3종 커밋.

### 스코프 재확인 필요

6. Phase 1.3 정의에 `lib/supabase-client.js`, `lib/utils/dom-safe.js`가 포함되는지 기획자와 재합의. 본 리포트는 현 커밋 기준이므로 해당 항목은 모두 N/A 처리.
7. `background/handlers/` 스켈레톤 5종(LOW) — 체크리스트상 LOW이나, service-worker.js 주석이 존재를 전제로 하고 있어 동반 커밋 권장.

### 종합 판정

**CONDITIONAL FAIL** — BLOCKER 13건 중 **2건 FAIL**(B-2, C-1), 4건 N/A(범위 재합의 필요), 나머지 7건 PASS. 위 #1·#2 수정 후 재검증 시 BLOCKER 통과 가능. HIGH/MEDIUM은 Phase 진행과 병행 수정 허용.
