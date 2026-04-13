# Phase 9 부가 기능 — 프론트엔드 작업 요약

작업자: 프론트엔드 에이전트
일시: 2026-04-14
대상 Phase: TASKS.md Phase 9 "부가 기능"

---

## 생성/수정 파일

### 신규 (8개)

| 경로 | 역할 | 줄 수 |
|---|---|---:|
| `extension/sidepanel/tools/char-counter.js` | 글자수(공백 포함/제외), 단어/문장/문단 수, 예상 읽기 시간. 실시간 입력 반영 + `setCounterText()`로 외부 주입 | 136 |
| `extension/sidepanel/tools/pomodoro.js` | 뽀모도로 UI. 1초 로컬 틱 + `chrome.storage.onChanged` 구독으로 background 상태 동기화 | 195 |
| `extension/background/handlers/pomodoro-handler.js` | `getState/start/pause/resume/reset` + `chrome.alarms` 절대 시간 `when` 사용. 모듈 top-level `onAlarm` 리스너(SW 재시작 시 재등록) | 198 |
| `extension/sidepanel/tools/forbidden-words.js` | `app_settings.forbidden_words` + `chrome.storage.local.__forbidden_words_user` 병합. `matchAll` 기반 매칭, `<mark>` 하이라이트(200ms debounce) | 260 |
| `extension/sidepanel/tools/screenshot.js` | 전체/영역 캡처. `chrome.tabs.captureVisibleTab` + canvas 크롭. 오버레이 주입 → 선택 메시지 수신(60s 타임아웃) → 미리보기 + `<a download>` | 181 |
| `extension/content/screenshot-overlay.js` | Shadow DOM(closed) 크로스헤어 선택 오버레이. ESC/우클릭 취소, 5px 미만 클릭은 자동 취소 | 164 |
| `extension/sidepanel/tabs/tools-tab.js` | `mount(container)` 컨트랙트. 템플릿 fetch→DOMParser→importNode → 4개 슬롯에 각 카드 렌더, `destroy()`에서 pomodoro 리스너 정리 | 95 |
| `extension/sidepanel/tabs/tools-tab.html` | 4개 슬롯 마크업(`data-slot="counter/pomodoro/forbidden/screenshot"`) | 16 |

총 1,245줄. **모든 파일 400줄 이하** (최대 260).

### 수정 (3개)

| 경로 | 변경 |
|---|---|
| `extension/manifest.json` | `permissions` 에 `"notifications"`, `"tabs"` 2건 추가 |
| `extension/background/handlers/index.js` | `pomodoroHandler` import + `tools.pomodoro.{getState,start,pause,resume,reset}` 5개 액션 등록 |
| `extension/sidepanel/panel.css` | `/* ─── Phase 9 부가 도구 ─── */` 블록 추가. `.bm-tools*`, `.bm-tool*`, `.bm-cc*`, `.bm-pomo*`, `.bm-fw*`, `.bm-shot*` |

---

## 권한 추가 근거

JSON은 주석을 지원하지 않아 manifest.json 본문에 근거를 인라인할 수 없습니다. 아래에 명시하여 리뷰 시점에 검증 가능하도록 남깁니다.

| 권한 | 필수 기능 | 사용 지점 |
|---|---|---|
| `notifications` | 뽀모도로 작업/휴식 종료 알림 (sidepanel 닫혀도 사용자 인지) | `pomodoro-handler.js:showNotification` — `chrome.notifications.create('bbm.pomodoro.work-done'/'break-done', ...)` |
| `tabs` | `chrome.tabs.captureVisibleTab` 호출 | `screenshot.js:capture`, `screenshot.js:captureAndCrop`. `activeTab` 단독으로는 sidepanel 문맥에서 캡처 대상 탭을 지정할 수 없음 |

`scripting`, `storage`, `alarms` 는 기존 권한으로 재사용. `host_permissions` 변경 없음(네이버 블로그 3 패턴 유지).

---

## 아키텍처 결정

### 1. 뽀모도로: background 단일 진실의 원천
- sidepanel 이 닫혀도 타이머가 진행되어야 하므로 상태를 `chrome.storage.local.__pomodoro_state` 에 영속화.
- `chrome.alarms.create(name, { when: plannedEndAt })` — 절대시간으로 `when` 전달. 배포환경 최소 30초 제약은 30초 미만 세션을 금지하지 않음(타이머는 분 단위).
- SW 재시작 시 `handlers/index.js` 가 `pomodoro-handler.js` 를 import → 모듈 top-level `chrome.alarms.onAlarm.addListener` 재등록. 이전 lifecycle 리스너는 SW가 소멸시키므로 중복 없음.
- UI는 1초 로컬 tick 으로 카운트다운 표시 + `chrome.storage.onChanged` 구독으로 phase 전이(work→break→idle) 감지. 틱 서버 역할은 background가 담당.

### 2. 스크린샷: sidepanel 오케스트레이터 + content 오버레이
- `html2canvas` 금지(CSP 원격 스크립트 차단 + 라이브러리 의존 0 원칙).
- sidepanel 에서 활성 네이버 탭 조회 → `chrome.scripting.executeScript({ files: ['content/screenshot-overlay.js'] })` 로 on-demand 주입(상시 content_scripts 등록 아님 — 성능/권한 최소화).
- 오버레이는 Shadow DOM(closed) + `position:fixed; z-index:2147483647`. host 페이지 CSS 영향 없음.
- 선택 완료 → `chrome.runtime.sendMessage({ action: 'tools.screenshotSelection', payload })`. sidepanel 의 screenshot.js 가 1회 한정 리스너로 수신(타임아웃 60s, `sender.id === chrome.runtime.id` 검증).
- 크롭은 sidepanel 문맥의 `<canvas>` 2d context로 수행 — devicePixelRatio 보정 포함. 결과는 `<a href="data:..." download>` 로 저장(추가 `downloads` 권한 불필요).

### 3. 금칙어: 전역 + 사용자 병합
- 전역 리스트: `public.app_settings WHERE key='forbidden_words'` 의 `value` 가 `string[]` 또는 `{ words: string[] }` 두 shape 모두 허용(RLS 상 공개 SELECT).
- 사용자 리스트: `chrome.storage.local.__forbidden_words_user` (Set으로 중복 제거, trim).
- 매칭: `matchAll` 이터레이터 기반 정규식(escape 처리). 하이라이트 범위 충돌은 사전 병합 후 `<mark class="bm-fw__hit">` 로 렌더. 200ms debounce.
- **TODO(repo)**: lib/ 쓰기 제한으로 `app-settings-repo.js` 미생성. 현재 forbidden-words.js 안에 `loadGlobalWords()` 인라인 쿼리. 후속 Phase 에서 repo 이관 필요.

### 4. 카운터: 독립 사용 + 외부 주입 겸용
- `createCharCounterCard({ initialText })` 로 초기값 주입 가능.
- `setCounterText(root, text)` 내보내 추후 sidebar-injector 와 연동 여지를 남김(현 Phase 에서는 직접 결합하지 않음 — 탭 카드로만 노출).
- 한국어 기준 분당 500자를 읽기 시간 추정치로 사용.

### 5. tools-tab: 동적 마운트 패턴
- `mount(container)` / `destroy()` 컨트랙트는 기존 `mypage-tab.js` 와 동일. panel.js 가 탭 활성화 시 `import('./tabs/tools-tab.js').then(m => m.mount(container))` 호출.
- 슬롯 매핑: `data-slot="counter|pomodoro|forbidden|screenshot"` → `createXxxCard()` 반환 노드 주입. 개별 카드 로드 실패해도 다른 카드는 정상 렌더.
- `destroy()` 시 pomodoro 카드만 내부 `setInterval`/리스너 정리(`destroyPomodoroCard`).

---

## 보안 / 규칙 준수

| 항목 | 결과 |
|---|---|
| `\.innerHTML\s*=` grep | **0건** (`extension/sidepanel/tools/`, `extension/content/screenshot-overlay.js`) |
| `\.outerHTML\s*=` / `insertAdjacentHTML\(` grep | **0건** |
| 외부 라이브러리 import | **0건** (html2canvas 등 배제, 모두 상대경로 내부 import) |
| Tailwind CDN / 외부 `<link>` / `<script src="https://...">` | **0건** |
| localStorage | **0건** — `chrome.storage.local` 만 사용 |
| dom-safe 경유 | 모든 동적 DOM 갱신 `createEl` / `safeText` / `clearAndAppend` 경유 |
| 파일당 400줄 | 최대 260 (forbidden-words.js) |
| 오버레이 origin 격리 | Shadow DOM(closed) + `z-index: 2147483647` + `:host { all: initial; }` |
| sender 검증 | `screenshot.js:waitForSelection` 의 `sender.id === chrome.runtime.id` 조건 |

---

## 메시지 계약 (새로 추가)

### background ↔ sidepanel
| action | payload | 응답 |
|---|---|---|
| `tools.pomodoro.getState` | — | `{ status, phase, startedAt, plannedEndAt, pausedRemainingMs, cycle, settings, remainingMs }` |
| `tools.pomodoro.start` | `{ workMinutes?: 1~180, breakMinutes?: 1~60 }` | 동일 state |
| `tools.pomodoro.pause` | — | 동일 state |
| `tools.pomodoro.resume` | — | 동일 state |
| `tools.pomodoro.reset` | — | 동일 state (idle) |

### content(overlay) → sidepanel
| action | payload |
|---|---|
| `tools.screenshotSelection` | `{ rect: { x, y, width, height }, devicePixelRatio, viewport, tabUrl }` 또는 `{ cancelled: true }` |

---

## 스코프 외 (미터치)

- `extension/auth/`, `extension/lib/`, `extension/mypage/`, `extension/payments/`(없음), `supabase/functions/`, `supabase/migrations/` — 모두 미변경.
- `background/service-worker.js` — 기존 `chrome.alarms.onAlarm` 리스너는 그대로 두고, `pomodoro-handler.js` 가 자체 모듈 top-level 리스너를 추가(여러 리스너는 모두 dispatch 됨).
- 기존 분석/벤치마크/학습 핸들러 및 UI — 미변경.

---

## 후속 의존 / TODO

1. **panel.js 탭 라우팅** — 기존 `TAB_IDS` 에 `'tools'` 추가 + 동적 import 호출 필요(본 작업 scope 외).
2. **`app-settings-repo.js`** — lib/ 쓰기 제한으로 미생성. `forbidden-words.js:loadGlobalWords` 의 인라인 supabase 호출을 후속 Phase 에서 이관.
3. **i18n (Phase 10)** — 하드코딩 한국어("집중/휴식/대기 중", "영역 캡처" 등) → `chrome.i18n.getMessage()` 이관.
4. **알림 아이콘** — `icons/icon128.png` 를 notification `iconUrl` 로 사용. 해당 PNG 실파일 없으면 Chrome 기본 아이콘이 표시됨(제출 전 제공 필요 — Phase 1.3 체크리스트와 동일 이슈).
5. **Alarm 최소 주기** — `chrome.alarms` 배포환경 최소 30초 제약. 뽀모도로는 분 단위라 문제 없으나, 개발 테스트 시 1분 미만 설정은 Chrome이 자동 반올림.

---

## 검증 방법 (권장)

```bash
# XSS / 위험 DOM API
grep -rn "\.innerHTML\s*=\|\.outerHTML\s*=\|insertAdjacentHTML" \
  extension/sidepanel/tools/ extension/content/screenshot-overlay.js \
  extension/sidepanel/tabs/tools-tab.js extension/background/handlers/pomodoro-handler.js

# 외부 라이브러리 잔존물
grep -rn "html2canvas\|from ['\"]https" extension/sidepanel/tools/ extension/content/screenshot-overlay.js

# 새 routes 등록 확인
grep -n "tools.pomodoro" extension/background/handlers/index.js

# 권한 확인
python3 -c "import json;print(json.load(open('extension/manifest.json'))['permissions'])"
# → ['storage','sidePanel','scripting','alarms','notifications','tabs']
```

수동 테스트:
1. 확장 재로드 → 사이드패널 "도구" 탭
2. 카운터: 붙여넣기 → 6가지 지표 실시간 갱신
3. 뽀모도로: 작업 1분/휴식 1분 설정 → 시작 → 사이드패널 닫고 1분 대기 → 알림 발생 → 휴식 1분 후 완료 알림
4. 금칙어: 사용자 단어 "테스트" 추가 → 본문 "이것은 테스트" 입력 → 노란 하이라이트
5. 스크린샷: 네이버 블로그 탭 열린 상태에서 "영역 캡처" → 크로스헤어 드래그 → 미리보기 → 저장

---

## Summary

- **신규 8개 + 수정 3개**(manifest.json, handlers/index.js, panel.css).
- 권한 2건(`notifications`, `tabs`) 최소 추가 — 근거 본 문서 §권한에 명시.
- `pomodoro-handler.js` 로 background-first 타이머 아키텍처 완성(sidepanel 닫혀도 동작).
- 스크린샷은 `chrome.tabs.captureVisibleTab` + sidepanel canvas 크롭으로 html2canvas 배제.
- 오버레이는 Shadow DOM(closed) + on-demand 주입으로 host page 영향 최소.
- innerHTML / 외부 라이브러리 / localStorage / Tailwind 모두 **0건**. 모든 파일 400줄 이하.

요약 문서: `_workspace/9_tools_summary.md`
