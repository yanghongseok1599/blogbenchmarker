# QA Report — Phase 2.1 Auth UI (교차 검증)

**검증자:** backend 에이전트 (supabase-backend)
**작성자:** extension-core / ui-builder (프론트엔드)
**검증일:** 2026-04-14
**검증 대상 파일:**
- `extension/auth/login.html` (89줄)
- `extension/auth/login.js` (128줄)
- `extension/auth/signup.html` (98줄)
- `extension/auth/signup.js` (123줄)
- `extension/auth/reset.html` (61줄)
- `extension/auth/reset.js` (103줄)

**기준 문서:** `_workspace/qa_checklist_2.1.md`

---

## Summary (요약)

| 구분 | 총계 | PASS | FAIL | N/A |
|------|------|------|------|-----|
| BLOCKER | 10 | 4 | 6 | 0 |
| HIGH | 21 | 6 | 14 | 1 |
| MEDIUM | 13 | 5 | 8 | 0 |
| **합계** | **44** | **15** | **28** | **1** |

> 참고: 체크리스트 헤더는 "41개 (BLOCKER 10 · HIGH 19 · MEDIUM 12)"로 적혀있으나, 실제 나열 항목을 세면 44개(BLOCKER 10 · HIGH 21 · MEDIUM 13)다. 본 리포트는 **실제 나열된 항목 전체**를 대상으로 검증한다.

### 치명 결함(BLOCKER) 6건

1. **[A-1]** 3개 HTML 전부 `<script src="https://cdn.tailwindcss.com">` 외부 원격 스크립트 로드 — MV3 `extension_pages` 기본 CSP(`script-src 'self'`)에 의해 로드 자체가 차단된다. TODO 주석(login.html:7)으로 인식은 돼있으나 미수정.
2. **[C-1]** `signInWithPassword` 실제 호출 없음 — 코드는 `throw new Error('Supabase client not wired yet (Phase 1.3 pending).')` 상태. 로그인 기능이 동작하지 않는다.
3. **[C-2]** `signUp` 실제 호출 없음 — 동일 이유. `options.data` 구조도 미정의.
4. **[D-1]** chrome.storage custom adapter를 사용하는 `lib/supabase-client.js` 파일 자체가 존재하지 않음(`extension/lib/` 에는 `env-config.*.js` 만 있음). 세션 저장 경로가 확정되지 않았다.
5. **[D-2]** 세션을 `chrome.storage.local` 에만 저장한다는 계약을 구현할 클라이언트가 없으므로 검증 불가능. 현 상태로는 SDK 기본 storage(localStorage)가 사용될 위험이 있다.
6. **[E-1]** 로그아웃 절차(`__intentional_logout` 플래그 + `signOut` + `storage.clear`) 미구현. Phase 2.1 범위에 로그아웃 UI 가 포함되지 않은 게 원인이라면 체크리스트와 범위가 불일치하다.

### 긴급 조치 필요

- `extension/lib/supabase-client.js`(Phase 1.3) 선행 없이는 Phase 2.1 검증이 사실상 불가능하다. 체크리스트 상당수가 "Phase 1.3 pending"으로 FAIL 처리됐다.
- CDN Tailwind 제거(또는 로컬 컴파일 번들 교체)는 CSP 차단으로 **UI가 스타일 없이 렌더될 것**이므로 즉시 수정 필요.

---

## A. HTML 구조 / XSS 차단

- [ ] **FAIL (BLOCKER) [A-1]** | login.html:8, signup.html:8, reset.html:8 | 인라인/원격 `<script>` 존재. 체크리스트 grep `"<script|on(click|load|error|submit)\s*="` 가 결과를 반환(6건: CDN Tailwind 3건 + 모듈 스크립트 3건). 특히 `https://cdn.tailwindcss.com` 원격 로드는 MV3 `script-src 'self'` CSP 위반. | **수정안:** Tailwind CLI 로 로컬 컴파일한 `auth.css` 생성 후 `<link rel="stylesheet" href="auth.css">` 로 교체. CDN `<script>` 삭제. `<script type="module" src="login.js">` 는 자기 자신 로드이므로 유지 가능(실제 "인라인" 아님). `on*=` 핸들러는 0건으로 통과.
- [x] **PASS (BLOCKER) [A-2]** | login.js:17,24 / login.js:32 / signup.js:18,24,31 / reset.js:17,23,30 | 모든 DOM 업데이트가 `textContent`. `innerHTML/outerHTML/insertAdjacentHTML` grep 결과 0건.
- [x] **PASS (BLOCKER) [A-3]** | `extension/auth/` grep `innerHTML|document\.write|eval\(` 0건 | 사용자 입력 포함 HTML 문자열 조립 없음.
- [ ] **FAIL (HIGH) [A-4]** | login.html:20-83, signup.html:19-92, reset.html:19-55 | 정적 텍스트("로그인", "이메일", "가입하기" 등) 모두 하드코딩. `chrome.i18n.getMessage` 호출 0건(grep). `extension/_locales/` 디렉토리 미존재. | **수정안:** `_locales/ko/messages.json` 생성 후 HTML 은 `__MSG_*__` 또는 JS 에서 `chrome.i18n.getMessage()` 호출로 치환.
- [x] **PASS (HIGH) [A-5]** | login.js:47-62, signup.js:61-76, reset.js:51-60 | `mapAuthError()` 가 반환하는 문자열은 전부 정적 리터럴. 사용자 입력(email) 을 에러 메시지에 삽입하지 않음.
- [x] **PASS (MEDIUM) [A-6]** | login.html:24 `<form>`, login.html:27 `<input type="email">`, login.html:40 `<input type="password">`, login.html:55 `<button type="submit">`, signup.html/reset.html 동일 | 의미적 HTML 사용 + `autocomplete` 속성 적용.

---

## B. 입력 검증

- [x] **PASS (HIGH) [B-1]** | login.html:28,34 `type="email" ... required`, login.js:5 `EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/` | 정규식 + HTML 속성 둘 다.
- [x] **PASS (HIGH) [B-2]** | login.html:47 `minlength="8"`, login.js:41 `password.length < 8` 체크 | 클라이언트 최소 길이 8자 강제.
- [x] **PASS (HIGH) [B-3]** | signup.js:52 `password !== passwordConfirm` | 불일치 시 "비밀번호가 일치하지 않습니다" 반환.
- [ ] **FAIL (HIGH) [B-4]** | login.js:41-43, signup.js:49-51 | 비밀번호 상한(72자, bcrypt 한계) 미검증. 73자 이상 입력 시 Supabase 서버에서 잘려서 후속 로그인 불일치 버그 유발 가능. | **수정안:** `if (password.length > 72) return '비밀번호는 72자 이하여야 합니다.'` 추가.
- [ ] **FAIL (MEDIUM) [B-5]** | login.js:68 `$('email').value.trim()`, signup.js:82 동일, reset.js:66 동일 | 공백 trim 은 적용됨. **lowercase 변환 누락.** 대소문자 섞인 이메일로 중복 가입 가능성. | **수정안:** `.trim().toLowerCase()` 로 변경.
- [ ] **FAIL (MEDIUM) [B-6]** | login.js:37-45, signup.js:45-59, reset.js:44-49 | "클라이언트 검증은 UX, 서버가 진짜 방어선" 의도를 남기는 주석 0건. | **수정안:** `validate()` 함수 위에 `// 클라이언트 검증은 UX 힌트. 실제 강제는 Supabase Auth 서버 측.` 한 줄 추가.
- [x] **PASS (MEDIUM) [B-7]** | login.js:55-57, signup.js:69-71, reset.js:53-55 | "시도 횟수가 너무 많습니다" 메시지로 rate-limit 안내 제공.

---

## C. Supabase Auth 호출 패턴

- [ ] **FAIL (BLOCKER) [C-1]** | login.js:79-85 | 실제 `signInWithPassword` 호출 없음. `throw new Error('Supabase client not wired yet (Phase 1.3 pending).')` 로 placeholder. | **수정안:** Phase 1.3 에서 `lib/supabase-client.js` 생성 후 주석 해제. 현 상태에선 로그인 기능 동작 불가.
- [ ] **FAIL (BLOCKER) [C-2]** | signup.js:95-105 | `signUp` 호출 placeholder. `options.data` 필드 미설계(display_name 등 profiles 트리거에 전달해야 할 메타 미정의). 비밀번호 console 로깅은 0건(`grep "console.*password"` 0건) → 이 부분만 PASS. 전체 항목은 호출 미구현으로 FAIL. | **수정안:** `options.data: { display_name }` 추가하여 `handle_new_user()` 트리거가 사용하도록 연결.
- [ ] **FAIL (HIGH) [C-3]** | login.js:99-103 (주석 상태) | `signInWithOAuth` 호출 경로가 주석에 `chrome.tabs.create({ url: data.url })` 로만 있음. **`chrome.identity.launchWebAuthFlow` 사용 없음.** `chrome.tabs.create` 방식은 redirect URL 소유권 검증이 없어 state-jacking 취약. | **수정안:** `chrome.identity.launchWebAuthFlow({ url: data.url, interactive: true })` 로 교체.
- [ ] **FAIL (HIGH) [C-4]** | 해당 없음 | Supabase 대시보드의 Allow Redirect URLs 등록 여부 확인 증거 없음(코드 외 운영 체크리스트 항목). | **수정안:** `docs/deployment.md` 에 `chrome-extension://<ID>/auth/callback.html` 등록 절차 명시. 콜백 HTML(`auth/callback.html`) 파일도 아직 없음.
- [x] **PASS (HIGH) [C-5]** | login.js 전체, signup.js 전체 | 수동 토큰 파싱(`URLSearchParams`, `hash`, `access_token` 등) 코드 0건. SDK 위임 설계.
- [x] **PASS (MEDIUM) [C-6]** | signup.html:85-88, signup.js:34-43 `showVerifyNotice()` | "이메일을 확인해 주세요" 고정 안내 섹션 + 전송 후 폼 비활성화 흐름 존재.

---

## D. 세션 저장 위치

- [ ] **FAIL (BLOCKER) [D-1]** | `extension/lib/` 디렉토리에 `env-config.example.js`, `env-config.js` 만 존재. `supabase-client.js` 없음. | chrome.storage custom adapter 구현 코드 자체가 없음. `grep "chrome.storage"` in `extension/auth/` 0건. | **수정안:** Phase 1.3 에서 `createClient(..., { auth: { storage: chromeStorageAdapter, ... } })` 구조로 생성.
- [ ] **FAIL (BLOCKER) [D-2]** | 동일 | chrome.storage.local vs sync 선택 코드 없음(adapter 자체가 없음). SDK 기본 동작(`localStorage`)이 적용될 위험. | **수정안:** adapter 구현 시 `chrome.storage.local.{get,set,remove}` 만 사용.
- [ ] **FAIL (HIGH) [D-3]** | auth/*.js 전체 | `persistSession: true`, `autoRefreshToken: true` 설정 0건(grep). | **수정안:** supabase-client 생성 시 명시.
- [ ] **FAIL (HIGH) [D-4]** | 동일 | `detectSessionInUrl: false` 설정 0건. | **수정안:** supabase-client 생성 시 명시. 확장은 URL hash 파싱 불필요.
- [ ] **FAIL (MEDIUM) [D-5]** | 동일 | `__auth_last_login_at` 류 비민감 메타 기록 코드 0건. | **수정안:** login 성공 핸들러(Phase 1.3)에서 `chrome.storage.local.set({ __auth_last_login_at: Date.now() })`.

---

## E. 로그아웃 완전 정리

- [ ] **FAIL (BLOCKER) [E-1]** | auth/*.js, background/ 전체 | 로그아웃 핸들러 파일·함수 자체가 없음(`background/handlers/` 비어있음). `__intentional_logout` 플래그, `signOut`, `storage.clear` 모두 미구현. | **수정안:** Phase 2.1 범위 재확인 후, 범위에 포함되면 `mypage/logout` 또는 `background/handlers/auth-handler.js` 에서 기존 버그 재현 금지 패턴 그대로 구현.
- [ ] **FAIL (HIGH) [E-2]** | 동일 | `onAuthStateChanged` 리스너 미등록(`service-worker.js` 검증 범위 외, grep 대상 auth/ 내 0건). | **수정안:** Phase 1.3 에서 supabase-client 초기화 직후 리스너 등록, 가드 추가.
- [ ] **FAIL (HIGH) [E-3]** | 동일 | 로그아웃 후 진입 경로 제어 없음. | **수정안:** `chrome.tabs.update({ url: chrome.runtime.getURL('auth/login.html') })`.
- [ ] **FAIL (MEDIUM) [E-4]** | 동일 | SW 캐시 삭제 책임자 문서 없음. | **수정안:** `docs/api.md` 또는 handler 상단 주석.

---

## F. CSRF / 세션 고정

- [ ] **FAIL (HIGH) [F-1]** | login.js:94-114 `handleGoogleLogin` | OAuth `state` 파라미터 검증 코드 없음. 현재는 호출 자체가 placeholder 이므로 state 생성·저장·비교 모두 미구현. | **수정안:** `crypto.getRandomValues()` 로 state 생성 → `chrome.storage.session` 임시 저장 → `launchWebAuthFlow` 결과 URL 의 state 와 동일 검증.
- [ ] **FAIL (HIGH) [F-2]** | login.js:78-92 | 로그인 성공 직후 분석 캐시/진행중 상태 초기화 호출 없음. Placeholder 이므로 불가피. | **수정안:** Phase 1.3 에서 `chrome.storage.local.remove(['__analyze_cache', '__benchmark_cache'])` 실행.
- [ ] **FAIL (MEDIUM) [F-3]** | auth/*.js 전체 | "확장 컨텍스트는 CSRF 대상 아님" 의도 주석 0건. | **수정안:** `login.js` 상단 주석에 1줄 추가.

---

## G. 권한 / 관리자 판정

- [x] **PASS (BLOCKER) [G-1]** | `extension/auth/` 전체 grep `"@(gmail\|admin\|naver)\.(com\|co\.kr)"` 0건, `"email\s*===\|if\s*\(\s*email\s*=="` 0건 | 이메일 기반 관리자 판정 없음.
- [ ] **N/A (HIGH) [G-2]** | 해당 코드 없음 | `profiles.is_admin` 조회 경로 자체가 Phase 2.1 범위 밖(mypage 미구현). 현재 관리자 UI 진입 경로 0건. | **수정안:** mypage 구현 시 `supabase.from('profiles').select('is_admin').eq('id', user.id).single()` 단일 쿼리로.
- [x] **PASS (MEDIUM) [G-3]** | login.html 전체 | login.html 에서 관리자 화면으로 직접 진입 링크 없음. `signup.html`, `reset.html` 로의 `<a>` 만 존재.

---

## H. 에러 처리 / UX

- [x] **PASS (HIGH) [H-1]** | login.js:47-62, signup.js:61-76, reset.js:51-60 | Supabase 에러 `error.message` 를 소문자 포함 매칭으로 사용자 친화 문구로 매핑. 원문 그대로 노출 없음.
- [ ] **FAIL (HIGH) [H-2]** | login.html 전체, login.js:58-60 | "네트워크 연결을 확인해 주세요" 메시지만 존재. 재시도 버튼 UI 요소 없음. `navigator.onLine` 기반 오프라인 감지 배너 0건. | **수정안:** `window.addEventListener('online'/'offline', ...)` + 상단 배너 `<div id="offline-banner" hidden>` 추가.
- [x] **PASS (MEDIUM) [H-3]** | login.js:52-54 | `email_confirmed_at=null` 상태(`"email not confirmed"`) 를 전용 문구로 매핑.
- [x] **PASS (MEDIUM) [H-4]** | signup.html:91-93, signup.js:34-43 | 가입 완료 후 `showVerifyNotice()` + 로그인 링크 노출.

---

## I. 빌드 / 레포지토리 위생

- [x] **PASS (BLOCKER) [I-1]** | `extension/auth/` grep `"password\s*=\s*['\"]\|AIza\|service_role"` 0건 | 비밀번호/API 키 하드코딩 없음.
- [x] **PASS (HIGH) [I-2]** | login.js:88,110 / signup.js:108 / reset.js:88 | `console.warn('[auth/...] ...', err)` 로만 err 객체 로깅. 비밀번호/access_token 직접 출력 없음. Supabase err 객체는 민감값을 포함하지 않음. | **참고:** 프로덕션 빌드 시 `console.*` 일괄 제거 파이프라인 필요(현재 빌드 스크립트 없음).
- [x] **PASS (MEDIUM) [I-3]** | `extension/auth/` 내 `.env` / `env-config.js` / 테스트 계정 하드코딩 0건 | 테스트 자격증명 미커밋.

---

## J. 경계면 shape (UI ↔ handler ↔ Edge)

- [ ] **FAIL (HIGH) [J-1]** | `extension/background/handlers/` 디렉토리 자체가 존재하지 않음(`background/` 에는 `service-worker.js` 만 있음) | `auth-handler.js` 미구현. `{ ok, data: { userId, email, plan }, error? }` shape 계약 검증 불가. | **수정안:** Phase 1.3 또는 별도 phase 에서 `background/handlers/auth-handler.js` 생성.
- [ ] **FAIL (HIGH) [J-2]** | login.js 전체 | 로그인 성공 후 `profiles` 조회 코드 없음(호출 자체 placeholder). | **수정안:** Phase 1.3 에서 `await supabase.from('profiles').select('plan, is_admin').eq('id', user.id).single()` 추가.
- [ ] **FAIL (MEDIUM) [J-3]** | signup.js 전체 | 회원가입 → `handle_new_user()` 트리거 race condition 대응 주석·재시도 로직 없음. | **수정안:** signup 성공 핸들러에 "트리거 INSERT 대기" 주석 + 재시도 또는 Auth 사용자 존재만으로 진입 허용하는 설계 결정 기록.

---

## 결론 & 권고

### 현재 상태 진단
Phase 2.1 산출물은 **UI 스켈레톤 + 검증 골격**으로는 품질이 양호하다:
- XSS 차단(textContent 일관 사용), 이메일 기반 관리자 판정 회피, 비밀번호 하드코딩 회피, 에러 메시지 매핑 레이어 등 **방어적 설계 자체는 올바르다.**
- 하지만 **Supabase Auth 실제 호출·세션 저장·로그아웃** 3대 축이 모두 Phase 1.3(`lib/supabase-client.js`) 에 의존하는데, Phase 1.3 이 아직 완료되지 않아 체크리스트의 절반 이상이 FAIL 처리됐다.

### 즉시 수정(BLOCKER)
1. **CDN Tailwind 제거** — 3개 HTML 모두. 로컬 컴파일 `auth.css` 로 교체하지 않으면 배포 시 스타일 0으로 렌더된다.
2. **Phase 1.3 선행** — `extension/lib/supabase-client.js` 생성 전까지 C/D/E 섹션은 실기능 0. Phase 순서 조정 필요(1.3 먼저, 그 다음 2.1 재검증).

### 중기 수정(HIGH)
- `_locales/ko/messages.json` + `chrome.i18n.getMessage` 경로(A-4)
- 비밀번호 72자 상한(B-4)
- `chrome.identity.launchWebAuthFlow` 로 OAuth 전환(C-3) + state 검증(F-1)
- `auth/callback.html` 생성 및 Supabase Allow Redirect URLs 등록(C-4)
- 오프라인 감지 + 재시도 UI(H-2)
- `background/handlers/auth-handler.js` 생성(J-1)

### 재검증 트리거
- Phase 1.3(`lib/supabase-client.js`) 완료 시 C/D/E/F/J 섹션 전원 재검증.
- CDN Tailwind 제거 + `_locales/` 추가 시 A 섹션 재검증.
