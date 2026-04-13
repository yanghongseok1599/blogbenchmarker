---
name: chrome-extension-security
description: Chrome Extension Manifest V3 개발 시 반드시 사용. "Chrome Extension", "Manifest V3", "manifest.json", "content script", "service worker", "sidepanel", "XSS", "innerHTML", "dom-safe", "clipboard", "API 키", "permissions", "host_permissions", "chrome.storage", "로그아웃", "signOut" 등이 언급되면 로드한다. 후속 트리거: "보안 검토", "MV3 이슈", "XSS 체크", "권한 과다". 키 노출·XSS·권한 과다·세션 관리 버그를 예방하는 표준 패턴을 제공한다.
---

# Chrome Extension Security Rules (MV3)

## 이 스킬이 전달하는 것

extension-core·ui-builder·security-qa 에이전트가 공통으로 따라야 할 보안·아키텍처 규칙. 기존 `blog-booster-pro`의 알려진 버그(XSS 가능성, 로그아웃 자동 재로그인, 키 노출 위험)를 답습하지 않기 위해 존재한다.

## 1. Manifest V3 최소 권한 원칙

### 1-1. permissions 선언
실제 사용하는 API만 추가. 쓰지 않는 권한은 Chrome Web Store 심사 반려 사유.

```json
{
  "manifest_version": 3,
  "name": "BLOG BenchMarker",
  "version": "1.0.0",
  "permissions": ["storage", "sidePanel", "tabs", "scripting", "alarms"],
  "host_permissions": [
    "https://blog.naver.com/*",
    "https://*.blog.naver.com/*",
    "https://m.blog.naver.com/*"
  ]
}
```

**금지:**
- `<all_urls>` — 전체 웹 접근 요청은 사용자 우려 + 심사 리스크
- `activeTab`과 `host_permissions` 동시 사용 (둘 중 하나만)
- `declarativeNetRequest`·`webRequest` — 필요 시에만

### 1-2. content_scripts.matches
네이버 블로그 글/글쓰기 페이지만 주입:

```json
"content_scripts": [{
  "matches": ["https://blog.naver.com/*", "https://*.blog.naver.com/*"],
  "js": ["content/extractor.js", "content/sidebar-injector.js"],
  "css": ["content/content.css"],
  "run_at": "document_idle"
}]
```

### 1-3. CSP 준수
MV3의 기본 CSP는 엄격하다:
- 동적 코드 실행 차단 — eval·Function 생성자·문자열 setTimeout 모두 금지
- 원격 스크립트 로드 금지 → 모든 JS는 번들에 포함
- 인라인 스크립트 태그 금지 → 외부 .js 파일로 분리
- 레거시 DOM 스트림 API 금지 — DOM 조작 메서드(createElement·appendChild)로 대체

## 2. Service Worker 패턴

### 2-1. 메시지 라우터 (service-worker.js)

50+ case switch는 안티패턴 (기존 `blog-booster-pro` 버그). Handler 맵을 사용한다.

```js
// background/service-worker.js
import { authHandler } from './handlers/auth-handler.js'
import { analyzeHandler } from './handlers/analyze-handler.js'

const handlers = {
  'auth.login': authHandler.login,
  'auth.logout': authHandler.logout,
  'analyze.post': analyzeHandler.analyze,
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const handler = handlers[msg.action]
  if (!handler) {
    sendResponse({ ok: false, error: `Unknown action: ${msg.action}` })
    return false
  }
  handler(msg.payload, sender)
    .then((data) => sendResponse({ ok: true, data }))
    .catch((e) => sendResponse({ ok: false, error: e.message }))
  return true  // 비동기 응답 유지 — 누락 시 sendResponse 유실
})
```

**핵심:** 비동기 응답 시 `return true` 누락하면 sendResponse가 버려진다.

### 2-2. Service Worker는 글로벌 state 금지
Service Worker는 idle 시 재시작된다. 모듈 스코프 변수는 소실된다. 영속 데이터는 `chrome.storage`에.

### 2-3. Supabase client 세션 복원
Service Worker 재시작 시 Supabase client가 storage에서 세션을 자동 복원하도록 **custom storage adapter** 필수.

```js
// lib/supabase-client.js
import { createClient } from '@supabase/supabase-js'

const chromeStorageAdapter = {
  getItem: (key) => new Promise(res =>
    chrome.storage.local.get([key], (r) => res(r[key] ?? null))),
  setItem: (key, value) => new Promise(res =>
    chrome.storage.local.set({ [key]: value }, res)),
  removeItem: (key) => new Promise(res =>
    chrome.storage.local.remove([key], res)),
}

export const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  {
    auth: {
      storage: chromeStorageAdapter,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    }
  }
)
```

## 3. XSS 방지 (BLOCKER 규칙)

### 3-1. 금지 API 목록
다음 DOM API는 이 프로젝트에서 **전면 금지**한다. 기존 `blog-booster-pro/sidepanel/panel.js`에서 다수 발견된 위험 지점이다.

| 금지 API | 대체 방법 |
|---|---|
| 요소에 `.innerHTML` 할당 | `textContent` 할당 또는 `el()` 헬퍼 |
| 요소에 `.outerHTML` 할당 | 부모에서 자식 교체 (`replaceChild`) |
| `insertAdjacentHTML(pos, userInput)` | 헬퍼로 노드 생성 후 `insertAdjacentElement` |
| 레거시 문서 스트림 API | `createElement` + `appendChild` |
| 사용자 입력 포함된 템플릿 문자열을 HTML로 삽입 | `textContent` |

허용되는 유일한 HTML 삽입 경로: `lib/utils/dom-safe.js`의 헬퍼. 헬퍼 내부에서도 사용자 데이터는 항상 `document.createTextNode`로 감싼다.

### 3-2. lib/utils/dom-safe.js 헬퍼

모든 DOM 조작은 이 헬퍼를 경유한다.

```js
// lib/utils/dom-safe.js
export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'className') node.className = v
    else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v)
    else if (k.startsWith('on')) node.addEventListener(k.slice(2).toLowerCase(), v)
    else node.setAttribute(k, v)
  }
  for (const c of children) {
    if (c == null) continue
    node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c)
  }
  return node
}

export function clearAndAppend(parent, ...children) {
  while (parent.firstChild) parent.removeChild(parent.firstChild)
  children.forEach(c => parent.appendChild(c))
}
```

사용 예:

```js
import { el, clearAndAppend } from '../lib/utils/dom-safe.js'

const card = el('div', { className: 'card' },
  el('h3', {}, post.title),
  el('p', { className: 'meta' }, `${post.charCount}자`),
  el('button', { onClick: handleAnalyze }, '분석하기')
)
clearAndAppend(container, card)
```

### 3-3. 네이버 블로그 추출 데이터는 텍스트로만
`content/extractor.js`는 DOM을 파싱해 **텍스트와 메타데이터만** 반환. HTML 문자열을 반환하면 수신자가 의도치 않게 삽입할 위험이 있으므로 차단.

```js
return {
  title: titleEl.textContent.trim(),
  paragraphs: Array.from(postBody.querySelectorAll('p')).map(p => p.textContent.trim()),
  images: Array.from(postBody.querySelectorAll('img')).map(img => ({
    src: img.src, alt: img.alt
  })),
}
```

## 4. API 키 보호

### 4-1. 확장프로그램에 들어가도 되는 것
- `SUPABASE_URL` (공개 URL)
- `SUPABASE_ANON_KEY` (RLS로 보호되는 공개 키)

**이 둘뿐이다.**

### 4-2. 절대 들어가면 안 되는 것
- `GEMINI_API_KEY`, `YOUTUBE_API_KEY` → Edge Function에서만
- `SUPABASE_SERVICE_ROLE_KEY` → Edge Function에서만
- 결제 webhook secret → Edge Function에서만
- 관리자 비밀번호 → 존재하지 않음 (is_admin 플래그로 대체)

### 4-3. env-config 관리

`lib/env-config.example.js`는 커밋, `lib/env-config.js`는 `.gitignore`. 구조:

```js
export const SUPABASE_URL = 'https://your-project.supabase.co'
export const SUPABASE_ANON_KEY = 'eyJ...your-anon-key...'
```

`.gitignore`에 반드시:
```
lib/env-config.js
```

### 4-4. 빌드 전 자체 검사

```bash
grep -rE "AIza[0-9A-Za-z_-]{30,}|sk_live|sk_test_live|service_role" extension/
```

0건이어야 함.

## 5. Chrome Storage 사용 규칙

### 5-1. 용도 분리
- `chrome.storage.local`: 세션(Supabase), 캐시 (용량 10MB)
- `chrome.storage.sync`: 사용자 설정 (기기간 동기화, 용량 100KB, 항목당 8KB)
- `chrome.storage.session`: 메모리 전용 (재시작 시 소실)

### 5-2. 진실의 원천은 Supabase
chrome.storage는 캐시일 뿐. 충돌 시 Supabase 데이터가 우선.

### 5-3. 로그아웃 완전 정리

기존 `blog-booster-pro/auth/login.js:41-46` 버그 재현 금지.

```js
export const authHandler = {
  async logout() {
    await chrome.storage.local.set({ __intentional_logout: true })

    const { error } = await supabase.auth.signOut()
    if (error) throw error

    await chrome.storage.local.clear()
    await chrome.storage.sync.clear()

    return { redirectTo: 'auth/login.html' }
  }
}
```

`onAuthStateChanged` 리스너는 `__intentional_logout` 플래그 존재 시 재로그인 트리거를 건너뛴다.

## 6. Clipboard 안전 복사

폴백 체인 필수.

```js
// lib/utils/clipboard.js
export async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text)
      return { ok: true, method: 'clipboard-api' }
    }
  } catch (e) { /* 폴백 */ }

  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    ta.remove()
    if (ok) return { ok: true, method: 'execCommand' }
  } catch (e) { /* 최종 폴백 실패 */ }

  return { ok: false, error: '클립보드 복사 실패. 직접 선택해 복사하세요.' }
}
```

## 7. 흔한 실수 체크리스트

- [ ] innerHTML 속성 사용 → `grep -rn "innerHTML" extension/` 에서 할당/읽기 모두 조사 → 할당은 0건
- [ ] API 키 하드코딩 → `grep -rE "AIza|sk_live|service_role" extension/` 0건
- [ ] `host_permissions`에 `<all_urls>` → 네이버 도메인만
- [ ] Service Worker에서 `return true` 누락 → async sendResponse 유실
- [ ] 로그아웃 시 storage clear 누락 → 자동 재로그인 발생
- [ ] Supabase client가 chrome.storage adapter 없음 → Service Worker 재시작 시 세션 소실
- [ ] 동적 코드 실행(eval·Function 생성자) 사용 → CSP 위반으로 로딩 실패
- [ ] 원격 CDN 스크립트 → 번들에 포함

## 8. 참고 스킬

- 기존 코드 포팅: `legacy-port-guide`
- DB 연동: `supabase-migration-rules`
- 배포 전 검증: `boundary-qa`
