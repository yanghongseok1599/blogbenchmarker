# QA 체크리스트 — Phase 2.1 (Auth UI — 로그인/회원가입)

> 검증 대상: `extension/auth/login.html`, `extension/auth/login.js`, 연관된 `lib/supabase-client.js`, `background/handlers/auth-handler.js`.
> 실행 시점: Phase 2.1 완료 직후. 실제 실행은 별도 작업(본 문서는 초안).
> 우선순위: **BLOCKER** / **HIGH** / **MEDIUM**.
> 근거 스킬: `chrome-extension-security §3 §4 §5-3`, `supabase-migration-rules §4`, `boundary-qa §4-2`.

---

## A. HTML 구조 / XSS 차단

- [ ] **[BLOCKER]** `login.html` 내 인라인 스크립트 또는 `on*=` 핸들러 속성 0건 — `grep -En "<script|on(click|load|error|submit)\s*=" extension/auth/login.html` 빈 결과.
- [ ] **[BLOCKER]** 로그인 폼 결과 렌더링(에러 메시지, 성공 안내, 이메일 표시 등)이 전부 `textContent` 또는 `dom-safe.js`의 `el()` 헬퍼 경유 — 문자열 기반 DOM 주입 패턴 0건.
- [ ] **[BLOCKER]** 사용자 입력값을 포함한 HTML 조립 후 DOM에 밀어넣는 코드 없음(스킬 `chrome-extension-security §3-1` 금지 목록 기준) — grep 0건.
- [ ] **[HIGH]** 폼 라벨 / placeholder 등 정적 텍스트는 `_locales/*/messages.json`의 `chrome.i18n.getMessage` 경유해 삽입.
- [ ] **[HIGH]** 에러 메시지에 사용자 입력(이메일 등)을 그대로 echo하지 않음 — 피싱·UI redress 방지.
- [ ] **[MEDIUM]** 폼 요소는 의미적 HTML(`<form>`, `<label>`, `<input type="email">`, `<button type="submit">`) 사용 — 키보드 접근성 + 브라우저 자동완성.

## B. 입력 검증 (클라이언트)

- [ ] **[HIGH]** 이메일 형식 검증 정규식 또는 `type="email"` + `required` 속성.
- [ ] **[HIGH]** 비밀번호 최소 길이 체크(8자 이상 권장, Supabase Auth 기본 6자 초과).
- [ ] **[HIGH]** 비밀번호 확인 필드 일치 여부 검증(회원가입 화면).
- [ ] **[HIGH]** 비밀번호 최대 길이 상한(72자, bcrypt 한계) — 초과 시 UX 에러.
- [ ] **[MEDIUM]** 이메일 트림(`.trim().toLowerCase()`) + 공백 혼입 차단.
- [ ] **[MEDIUM]** 클라이언트 검증은 UX 목적이며 **서버 검증(Supabase Auth)이 진짜 방어선**임을 코드 주석으로 명시(의도 기록).
- [ ] **[MEDIUM]** 연속 실패 시 rate-limit 안내 문구 — Supabase Auth의 brute-force 차단 메시지 사용자화.

## C. Supabase Auth 호출 패턴

- [ ] **[BLOCKER]** 로그인은 `supabase.auth.signInWithPassword({ email, password })` 직접 호출 — 백엔드 우회·커스텀 JWT 생성 없음.
- [ ] **[BLOCKER]** 회원가입은 `supabase.auth.signUp(...)` + `options.data`로 메타데이터 전달, 비밀번호는 체인의 어느 지점에서도 로깅되지 않음 — `grep -rEn "console\.(log|info|warn)\(.*password" extension/` 0건.
- [ ] **[HIGH]** OAuth 로그인은 `supabase.auth.signInWithOAuth({ provider, options: { redirectTo } })` 사용 + `chrome.identity.launchWebAuthFlow` 경유.
- [ ] **[HIGH]** OAuth redirect URL이 `chrome-extension://<id>/auth/callback.html`만 허용되도록 Supabase Auth Dashboard의 **Allow Redirect URLs**에 등록 확인(운영 절차 체크리스트).
- [ ] **[HIGH]** `signInWithOAuth` 이후 토큰 교환은 SDK가 자동 수행 — 수동 토큰 파싱 코드 없음(토큰 유출 리스크 회피).
- [ ] **[MEDIUM]** 이메일 인증 메일 발송 성공 시 사용자에게 "메일함 확인" 안내(Supabase Auth confirm email 흐름).

## D. 세션 저장 위치 — chrome.storage vs localStorage

- [ ] **[BLOCKER]** Supabase client가 **chrome.storage custom adapter**를 사용(스킬 §2-3) — `localStorage.setItem` 세션 저장 코드 0건.
- [ ] **[BLOCKER]** 세션 토큰이 `chrome.storage.local`에만 존재 — `chrome.storage.sync` 금지(용량·암호화 미보장).
- [ ] **[HIGH]** `persistSession: true` + `autoRefreshToken: true` 설정 — 만료 자동 갱신.
- [ ] **[HIGH]** `detectSessionInUrl: false` — 확장은 URL hash 파싱 불필요(CSRF/토큰 누설 리스크 축소).
- [ ] **[MEDIUM]** login 성공 후 `chrome.storage.local.set({ __auth_last_login_at: ... })` 같은 비민감 메타만 기록, 토큰은 별도 기록하지 않음.

## E. 로그아웃 완전 정리 (기존 버그 재현 금지)

- [ ] **[BLOCKER]** 로그아웃 절차가 스킬 `chrome-extension-security §5-3` 패턴(`__intentional_logout` 플래그 → `signOut()` → `chrome.storage.local.clear()` + `chrome.storage.sync.clear()`) 완전 준수.
- [ ] **[HIGH]** `onAuthStateChanged` 리스너가 `__intentional_logout` 플래그 존재 시 자동 재로그인 트리거 건너뜀 — 코드에 가드 존재.
- [ ] **[HIGH]** 로그아웃 후 진입 경로는 `auth/login.html`만 — 이전 URL로 자동 복귀 경로 없음(세션 소실 상태에서 사이드패널 혼란 방지).
- [ ] **[MEDIUM]** 로그아웃 후 Service Worker 캐시(메모리 변수) 삭제 책임자 문서화(handler 모듈에서 재초기화).

## F. CSRF / 세션 고정 대비

- [ ] **[HIGH]** 확장 컨텍스트는 전통적 웹 CSRF 대상이 아니지만, OAuth redirect의 `state` 파라미터 검증 존재 — `launchWebAuthFlow` 결과 URL에서 state가 원본과 일치하는지 확인.
- [ ] **[HIGH]** 로그인 직후 기존 세션 데이터(캐시·진행중인 analyze 결과 등) 초기화 — 세션 고정 회피.
- [ ] **[MEDIUM]** 로그인 폼 POST가 아닌 SDK 호출 경로이므로 CSRF 토큰 불필요. 대신 sender validation(스킬 §2-1)과 별개 경로임을 주석으로 명시.

## G. 권한 / 관리자 판정

- [ ] **[BLOCKER]** UI 로직에서 관리자 판정이 이메일 비교로 이루어지지 않음 — `grep -rEn "@(gmail|admin|naver)\.(com|co\.kr)" extension/auth/ extension/mypage/` 결과에 `if (email === ...)` 패턴 0건.
- [ ] **[HIGH]** 관리자 UI 진입은 `profiles.is_admin` 조회 결과만 사용 — RLS가 본인 row만 허용하므로 한 번의 SELECT로 충분.
- [ ] **[MEDIUM]** 관리자 화면이 login.html에서 직접 진입 불가 — 항상 인증 후 `profiles.is_admin=true` 확인 경로.

## H. 에러 처리 / UX

- [ ] **[HIGH]** Supabase Auth 에러 객체(`error.message`)를 그대로 노출하지 않고, 사용자 친화 메시지 매핑 — "Invalid login credentials" → "이메일 또는 비밀번호가 올바르지 않습니다".
- [ ] **[HIGH]** 네트워크 장애 시 재시도 버튼 + 오프라인 감지 배너.
- [ ] **[MEDIUM]** 이메일 인증 미완료 상태(`email_confirmed_at = null`) 로그인 시 안내 문구 분기.
- [ ] **[MEDIUM]** 회원가입 → 로그인 자동 전환 흐름(UX) 또는 명시적 안내.

## I. 빌드 / 레포지토리 위생

- [ ] **[BLOCKER]** `login.js`에 비밀번호·API 키 하드코딩 0건 — `grep -rEn "password\s*=\s*['\"]|AIza|service_role" extension/auth/` 0건.
- [ ] **[HIGH]** `console.log`에 민감값(이메일 전체, 비밀번호, access_token) 출력 0건 — production 빌드 시 제거되는지.
- [ ] **[MEDIUM]** 테스트용 계정/토큰이 커밋되지 않음 — `.env`·`env-config.js`는 `.gitignore`.

## J. 경계면 shape (UI ↔ handler ↔ Edge)

- [ ] **[HIGH]** `auth-handler.js` 응답 shape `{ ok, data: { userId, email, plan }, error? }` — UI가 참조하는 필드와 일치.
- [ ] **[HIGH]** 로그인 성공 후 UI가 바로 `profiles` 조회 → `plan`·`is_admin` 수신. 이 시점 RLS에 의해 본인 row만 반환되는지 시뮬레이션 항목 기록.
- [ ] **[MEDIUM]** 회원가입 → `handle_new_user()` 트리거가 비동기적으로 `profiles` INSERT. UI가 즉시 profiles 조회 시 race condition 가능 — 재시도 로직 또는 Auth 사용자 존재만으로 진입 허용하는 설계 결정 문서화.

---

**합계:** 41개 (BLOCKER 10 · HIGH 19 · MEDIUM 12 · LOW 0)

**검증 주의사항:**
- OAuth 실제 동작 검증은 Supabase 프로젝트에 redirect URL 등록 + Google/GitHub 등 외부 IdP 설정 완료 후 수행.
- 이메일 인증 플로우는 Supabase 대시보드의 "Enable email confirmations" 토글 상태에 따라 달라지므로 운영 환경 설정과 동기화 필요.
