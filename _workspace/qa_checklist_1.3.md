# QA 체크리스트 — Phase 1.3 (Chrome Extension 골격 / Manifest V3)

> 검증 대상: `extension/manifest.json`, `extension/background/service-worker.js`, `extension/content/*`, `extension/sidepanel/*`, `extension/lib/supabase-client.js`, `extension/lib/utils/dom-safe.js`.
> 실행 시점: Phase 1.3 완료 직후. 실제 실행은 별도 작업(본 문서는 초안).
> 우선순위: **BLOCKER** / **HIGH** / **MEDIUM**.
> 근거 스킬: `chrome-extension-security`, `boundary-qa §3-1 ~ §3-5`.

---

## A. manifest.json — 기본 구조

- [ ] **[BLOCKER]** `"manifest_version": 3` 명시 (V2는 Chrome Web Store 제출 거부).
- [ ] **[HIGH]** `name`·`version`·`description`·`default_locale` 4가지 필수 필드 모두 존재.
- [ ] **[HIGH]** `default_locale: "ko"` + `_locales/ko/messages.json` 존재 (다국어 엔트리 누락 시 스토어 경고).
- [ ] **[MEDIUM]** `version`이 유효한 시맨틱 버전(`x.y.z` 또는 `x.y.z.w`) 형식.
- [ ] **[MEDIUM]** `icons`(16/48/128) 세 사이즈 모두 PNG로 존재, 파일 크기 합리적(<100KB).
- [ ] **[MEDIUM]** `action` 또는 `side_panel` 진입점이 명확히 지정.

## B. permissions 최소 권한 (Manifest V3 핵심)

- [ ] **[BLOCKER]** `<all_urls>` 사용 금지 — `host_permissions`·`matches` 모두 확인.
- [ ] **[BLOCKER]** `permissions`에 `activeTab`과 `host_permissions`가 **동시 선언되지 않음** (스킬 §1-1).
- [ ] **[HIGH]** 실제 사용하는 chrome API만 선언 — `grep -rEn "chrome\.(storage|sidePanel|tabs|scripting|alarms|runtime)" extension/` 결과와 manifest 권한 매칭. 과다/과소 시 HIGH.
- [ ] **[HIGH]** `declarativeNetRequest`·`webRequest`·`debugger`·`management` 등 위험 권한 미사용.
- [ ] **[HIGH]** `cookies` 권한 없음 — Supabase 세션은 chrome.storage 사용, cookie 경로 불필요.
- [ ] **[MEDIUM]** `optional_permissions`를 활용해 민감 권한은 사용자 승인 기반으로 분리.
- [ ] **[MEDIUM]** 권한별 용도를 `README.md` 또는 스토어 설명에 정리(심사 대비).

## C. host_permissions 범위

- [ ] **[BLOCKER]** 네이버 블로그 도메인만 허용 — `https://blog.naver.com/*`, `https://*.blog.naver.com/*`, `https://m.blog.naver.com/*` 이외 없음.
- [ ] **[HIGH]** `https://*.supabase.co/*` 등 Supabase 호스트는 host_permissions 불필요 (fetch는 기본 허용) — 잘못 추가됐으면 HIGH.
- [ ] **[HIGH]** `https://*/*`, `http://*/*` 와일드카드 금지.
- [ ] **[MEDIUM]** Gemini 직접 호출 URL이 host_permissions에 있으면 제거 — 클라이언트 직접 호출은 설계상 금지(Edge Function 경유).

## D. content_scripts 주입 화이트리스트

- [ ] **[BLOCKER]** `matches`가 네이버 블로그 글/글쓰기 페이지로 한정 (스킬 §1-2 예시).
- [ ] **[HIGH]** `run_at: "document_idle"` 명시 — 너무 이른 주입 시 DOM 미완성 이슈.
- [ ] **[HIGH]** `all_frames: true`가 꼭 필요한 곳만 (네이버 블로그 글은 iframe 구조이므로 검토).
- [ ] **[HIGH]** `js` 파일 배열이 실제 `extension/content/` 파일과 일치하는지 — dangling reference 없음.
- [ ] **[MEDIUM]** `css`·`js` 주입 순서가 의존성 역순 아닌지(extractor → analyzer → injector 순).
- [ ] **[MEDIUM]** 글쓰기 페이지용 `sidebar-injector.js`가 글쓰기 URL 패턴에만 주입되도록 별도 content_scripts 블록 분리.
- [ ] **[MEDIUM]** content script가 `window` 전역 오염 없는지 (IIFE 또는 ES module 래핑).

## E. CSP (Content Security Policy)

- [ ] **[BLOCKER]** MV3 기본 CSP(`script-src 'self'; object-src 'self'`) 유지 — `content_security_policy` 필드 오버라이드 시 불필요하게 완화 금지.
- [ ] **[BLOCKER]** 사용 시 `'strict-dynamic'` 또는 해시 기반만 허용, unsafe 디렉티브 금지.
- [ ] **[BLOCKER]** 원격 스크립트 URL(CDN 등) 로드 금지 — 모든 의존성 로컬 번들.
- [ ] **[BLOCKER]** 동적 코드 실행 패턴(스킬 `chrome-extension-security §1-3` 금지 목록) 전면 금지 — 정적 분석으로 해당 패턴 0건 확인.
- [ ] **[HIGH]** 인라인 `<script>` 태그 또는 `on*=` 핸들러 속성 없음 — HTML 파일 grep으로 0건 확인.
- [ ] **[MEDIUM]** `web_accessible_resources`가 필요한 리소스만 선언, `matches` 네이버 도메인 한정.

## F. Service Worker (`background/service-worker.js`)

- [ ] **[BLOCKER]** 메시지 라우터가 **handler 맵 패턴** 사용 — `grep -c "case '" extension/background/service-worker.js` 임계값 이하(대형 switch 안티패턴 회피).
- [ ] **[BLOCKER]** 비동기 응답 경로에 `return true` 존재 — `chrome.runtime.onMessage.addListener` 블록 반환값 확인 (누락 시 응답 유실).
- [ ] **[HIGH]** 모듈 스코프 가변 상태(글로벌 변수 캐시 등) 없음 — Service Worker idle 재시작 시 소실되므로 금지.
- [ ] **[HIGH]** 메시지 payload 스키마 검증 — `msg.action`이 화이트리스트에 없으면 `{ ok: false, error }` 반환.
- [ ] **[HIGH]** 외부 origin으로부터의 `chrome.runtime.onMessageExternal` 허용 origin 명시 — 기본적으로 사용하지 않음이 안전. 사용 시 `externally_connectable.matches` 화이트리스트.
- [ ] **[HIGH]** `sender.id`가 본 확장 ID와 일치하는지 검증하는 헬퍼 존재(여러 확장이 있을 때 방어).
- [ ] **[MEDIUM]** 모든 handler가 `{ ok: boolean, data?, error? }` shape 반환 — 경계면 일관성.
- [ ] **[MEDIUM]** 로깅은 개발 환경에서만(production 빌드 시 제거).

## G. Supabase Client / 세션 저장 위치

- [ ] **[BLOCKER]** `lib/supabase-client.js`가 **chrome.storage custom adapter** 사용 — `localStorage` fallback 없음 (Service Worker에 window 미존재).
- [ ] **[BLOCKER]** `SUPABASE_URL`·`SUPABASE_ANON_KEY`만 클라이언트에 포함 — `grep -nE "service_role|SUPABASE_SERVICE_ROLE_KEY" extension/` 0건.
- [ ] **[HIGH]** `autoRefreshToken: true`, `persistSession: true`, `detectSessionInUrl: false` 설정 확인.
- [ ] **[HIGH]** 세션 key(`sb-*-auth-token`)가 `chrome.storage.local`에 저장 — `chrome.storage.sync` 사용 금지(용량 8KB 초과 리스크).
- [ ] **[MEDIUM]** `env-config.js`는 `.gitignore` 대상, `env-config.example.js`만 커밋됨 — `git ls-files extension/lib/env-config.js` 빈 결과.

## H. 메시지 출처 검증 (sender validation)

- [ ] **[BLOCKER]** content script → background 메시지에서 `sender.tab?.url`이 네이버 도메인인지 확인하는 가드 존재(`analyze`, `benchmark` 등 payload 수신 시).
- [ ] **[HIGH]** sidepanel → background 메시지는 `sender.id === chrome.runtime.id`로 자기 확장 확인.
- [ ] **[HIGH]** `window.postMessage` 수신 시 `event.origin` 화이트리스트 검증(있는 경우).
- [ ] **[MEDIUM]** sender 검증 실패 시 즉시 `{ ok: false, error: 'forbidden' }` 반환 + `usage_logs`에 경고 남김 설계(선택).

## I. DOM Safe 헬퍼 / XSS 예방

- [ ] **[BLOCKER]** `extension/lib/utils/dom-safe.js` 존재 + `el()`·`clearAndAppend()` export.
- [ ] **[BLOCKER]** 전체 extension에서 스킬 `chrome-extension-security §3-1` "금지 API 목록"에 나열된 5가지 DOM 할당/삽입 패턴이 0건 — 정규식 grep 결과 빈 결과여야 함.
- [ ] **[BLOCKER]** content script·sidepanel에서 사용자 입력을 HTML 문자열로 조립해 DOM에 주입하는 패턴 없음 — 반드시 `dom-safe.js`의 `el()` 경유.
- [ ] **[HIGH]** content/extractor.js는 텍스트·메타데이터만 반환(HTML 문자열 금지) — 반환 타입에 `html`·`rawHtml` 키 없음.
- [ ] **[HIGH]** 레거시 문서 스트림 API(스킬 §3-1 표 4번째 행) 사용 0건.
- [ ] **[MEDIUM]** 템플릿 리터럴로 HTML 조립 후 DOM 속성 할당한 흔적 없음 — 수작업 리뷰.

## J. 기타 골격 파일

- [ ] **[HIGH]** `sidepanel/panel.html`이 외부 script src 없고 `panel.js` 단일 모듈만 로드.
- [ ] **[HIGH]** `auth/login.html`이 OAuth redirect 페이지가 아닌 내부 페이지로 동작 — OAuth는 `chrome.identity.launchWebAuthFlow` 경유.
- [ ] **[MEDIUM]** `_locales/ko/messages.json` 기본 키(`appName`, `appDesc`) 존재.
- [ ] **[MEDIUM]** `icons/` 경로가 manifest와 일치, 누락 없음.
- [ ] **[LOW]** `background/handlers/` 폴더에 `auth`, `analyze`, `generate`, `benchmark`, `usage` 5개 핸들러 파일 스켈레톤 존재.

---

**합계:** 46개 (BLOCKER 13 · HIGH 18 · MEDIUM 14 · LOW 1)

**검증 주의사항:**
- Phase 1.3는 실제 기능 구현 전 골격 단계이므로, 존재 확인 수준의 항목은 HIGH/MEDIUM으로 완화. 단 **보안 관련(XSS, 키 노출, 권한 범위)**은 골격부터 BLOCKER.
- Chrome 확장 로드 테스트(`chrome://extensions` → 개발자 모드 → 압축해제된 확장 로드)는 실제 검증 단계에서 수행.
