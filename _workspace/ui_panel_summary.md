# UI/UX 개선 — 사이드패널 리뉴얼 작업 요약

작업자: 프론트엔드 에이전트
일시: 2026-04-14
대상: `extension/sidepanel/panel.html` + `extension/sidepanel/panel.js`

---

## 수정 파일

| 경로 | 변경 | 줄 수 |
|---|---|---:|
| `extension/sidepanel/panel.html` | 전면 교체 — 헤더(로고+유저슬롯) + 6탭 + 패널 6개 + 푸터 | 200 |
| `extension/sidepanel/panel.js` | 전면 재작성 — 6탭 메타 기반 라우팅 + lazy mount + 해시 동기화 + 유저 슬롯 + 키보드 a11y | 308 |

총 508줄. 개별 파일 모두 500줄 이하.

### 수정하지 않은 파일 (사용자 지시 준수)

- `extension/sidepanel/panel.css` — 기획자(pane 1) 작업 중, 미변경.
- `extension/sidepanel/tabs/*` — 기존 mount 함수 시그니처 그대로 재사용.
- `extension/lib/*`, `extension/auth/*`, `extension/mypage/*`, `extension/background/*`, `extension/content/*`, `supabase/*`, `docs/*` — 모두 미변경.

---

## 주요 개선 사항

### 1. 헤더 (`bm-header`)

```
┌──────────────────────────────────────────────────┐
│ [logo] BLOG BenchMarker         [avatar / 로그인] │
└──────────────────────────────────────────────────┘
```

- **로고**: `icons/icon48.png` 를 28×28 로 표시, `aria-hidden="true"` (장식적).
- **서비스명**: `<h1 class="bm-title">` — i18n `app_name` 바인딩.
- **유저 슬롯(`#bm-user-slot`)**: `panel.js` 가 `getSession()` 결과에 따라 동적 렌더
  - 세션 존재 → `bm-header__avatar` 버튼(이니셜 + tooltip 에 `displayName · email`). 클릭 시 `activateTab('mypage')`.
  - 세션 없음 → `bm-header__login` 버튼(🔑 + "로그인"). 클릭 시 `chrome.tabs.create(chrome.runtime.getURL('auth/login.html'))`.
- **실시간 갱신**: `onAuthChange()` 구독 — 로그인/로그아웃 발생 시 `refreshUserSlot()` 재호출.

### 2. 탭 네비게이션 (6탭)

기존 4탭(분석/벤치마크/생성/마이) → **6탭**:

| ID | 아이콘 | 라벨 | i18n 키 | mount |
|---|---|---|---|---|
| `analyze`   | 📊 | 분석     | `tab_analyze`   | `mountAnalyzeTab` |
| `benchmark` | 🏆 | 벤치마크 | `tab_benchmark` | `mountBenchmarkTab` |
| `generate`  | ✨ | 생성     | `tab_generate`  | `mountGenerateTab` |
| `learning`  | 📚 | 학습     | `tab_learning`  | `mountLearningTab` |
| `tools`     | 🛠️ | 도구     | `tab_tools`     | `mount` (기본 export) |
| `mypage`    | 👤 | 마이     | `tab_mypage`    | `mount` (기본 export) |

- 각 `<button class="bm-tab">` 은 `<span class="bm-tab__icon">` + `<span class="bm-tab__label">` 구조.
- `aria-controls` 로 패널 id 매핑, `aria-selected` + `tabindex` 동기화.
- **키보드 접근성**: ←/→ 로 이전/다음 탭, Home/End 로 처음/끝 탭 이동. 활성 탭만 `tabindex="0"` (다른 탭은 `-1`) — 표준 WAI-ARIA tabs 패턴.

### 3. 탭 패널 (`bm-panel`)

- 각 탭은 `<section role="tabpanel" data-panel="{id}" id="bm-panel-{id}">` 단일 루트.
- 비활성 탭은 `hidden` 속성 + `is-active` 클래스 제거. CSS 는 `.is-active { opacity:1; transform: translateY(0); }` 전제(기획자가 panel.css 에 작성 예정).
- **lazy mount**: 탭 활성화 시 `mountTab()` 이 `mountedTabs` Set 으로 중복 방지 후 최초 1회 import + 호출.
- **시그니처 정규화**: `TAB_META[].mountName` 으로 `mountAnalyzeTab` / `mountBenchmarkTab` / `mount` 차이를 흡수 (`mod[mountName] || mod.default?.mount`).
- **destroy 지원**: `tools-tab`, `mypage-tab` 의 `mount()` 반환값이 `{ destroy }` 를 가지면 `tabDisposers` Map 에 저장(향후 탭 언마운트 시점에 호출 가능).

### 4. 푸터

```
┌──────────────────────────────────────────────────┐
│ v0.1.0                              ? 도움말     │
└──────────────────────────────────────────────────┘
```

- `#bm-footer-version` 에 `v${APP_VERSION}` (상수 `APP_VERSION = '0.1.0'`). 빌드 파이프라인에서 `package.json` 버전과 동기화 여지.
- `#bm-help-link`: 클릭 시 `chrome.tabs.create({ url: chrome.runtime.getURL('mypage/mypage.html#faq') })` 로 fallback. `docs/FAQ.md` 공개 호스팅 확정 후 해당 URL 로 치환 필요(TODO).

### 5. URL 해시 동기화

- 진입 시 `location.hash` 에서 탭 id 읽음 — 허용 목록(`TAB_IDS`) 에 있으면 해당 탭 활성화, 없으면 기본 `analyze`.
- 탭 전환 시 `history.replaceState(null, '', '#{id}')` (폴백: `location.hash = '#{id}'`). `pushState` 아님 — 뒤로가기 히스토리 오염 방지.
- `hashchange` 이벤트 구독 → 북마크/주소창 수정 시에도 반영.
- 외부 트리거용으로 `__panel.activateTab(id)` export (window 오염 없음).

### 6. 누락 탭 안전 폴백

```js
try {
  const mod = await meta.loader()
  const fn = mod?.[meta.mountName] || mod?.default?.mount
  if (typeof fn !== 'function') {
    console.warn(`${meta.id} 탭 mount 함수 미존재 — placeholder 유지`)
    return
  }
  await fn(panelEl)
} catch (err) {
  mountedTabs.delete(meta.id) // 재시도 허용
  placeholder 텍스트를 에러 안내로 교체
}
```

- **모듈 import 실패(404/네트워크)**: placeholder 를 "탭을 불러올 수 없습니다. 네트워크를 확인하고 탭을 다시 눌러 주세요." 로 교체 + `mountedTabs` 해제 → 재클릭 시 재시도.
- **mount 함수 미존재**: placeholder 원본 유지 + console.warn.
- 탭 전환 자체는 항상 성공(버튼/패널 상태는 에러와 무관하게 갱신).

---

## 보안 / 규칙 준수

| 검사 | 결과 |
|---|---|
| `\.innerHTML\s*=` / `\.outerHTML\s*=` / `insertAdjacentHTML\(` grep | **0건** |
| `eval` / 동적 함수 생성자 | 0건 |
| 외부 CDN `<script>` / `<link>` | 0건 |
| dom-safe 경유 | 유저 슬롯·푸터 갱신 전부 `createEl` / `safeText` / `clearAndAppend` |
| 파일당 500줄 | panel.html 200 / panel.js 308 ✅ |
| panel.css 수정 | **없음** (기획자 scope) |
| 기존 탭 모듈 수정 | **없음** (시그니처 재사용) |

---

## 기획자(panel.css) 와의 계약 (BEM 클래스)

기획자가 panel.css 를 작성할 때 아래 클래스를 기대합니다.

### 기본 구조

- `.bm-body` — body (선택적)
- `.bm-header` / `.bm-header__brand` / `.bm-header__logo` / `.bm-header__user`
- `.bm-header__avatar` / `.bm-header__login` / `.bm-header__login-icon` / `.bm-header__login-label`
- `.bm-title`
- `.bm-tabs` / `.bm-tab` / `.bm-tab.is-active` / `.bm-tab__icon` / `.bm-tab__label`
- `.bm-panels` / `.bm-panel` / `.bm-panel.is-active`
- `.bm-placeholder`
- `.bm-footer` / `.bm-footer__version` / `.bm-footer__help` / `.bm-footer__help-icon` / `.bm-footer__help-label`

### 전환 애니메이션 권장 CSS (참고용, 기획자 재량)

```css
.bm-panel {
  opacity: 0;
  transform: translateY(8px);
  transition: opacity 200ms ease, transform 200ms ease;
}
.bm-panel.is-active { opacity: 1; transform: translateY(0); }
.bm-panel[hidden]   { display: none; }
```

`hidden` 속성이 `display: none` 을 부여하므로 transition 은 `is-active` 상태 변화(display 이후) 에서만 동작합니다. 완전한 페이드인을 원하면 JS 에서 hidden 제거 → rAF → class 추가 2단계 처리 필요(현재 미적용 — 기획자와 논의 후 결정).

---

## 후속 작업 / TODO

1. **panel.css 대응**: 기획자가 위 BEM 클래스에 맞춰 스타일 작성 완료 후 시각 QA.
2. **도움말 링크**: `docs/FAQ.md` 공개 호스팅 URL 확정 시 `handleFooterHelp` 의 `chrome.tabs.create` URL 을 교체.
3. **learning/tools 탭 i18n 키 추가**: `_locales/{ko,en,ja}/messages.json` 에 `tab_learning`, `tab_tools`, `placeholder_learning`, `placeholder_tools`, `footer_help` 키 누락 가능성. i18n 초기화 실패 시 data-i18n 의 기본 텍스트로 폴백되므로 즉시 치명적이진 않음.
4. **버전 동기화**: `APP_VERSION` 상수를 `manifest.json.version` 으로부터 빌드 시 주입하는 파이프라인 검토.
5. **destroy 호출 지점**: 현재 `tabDisposers` 는 저장만 되며 언마운트 트리거가 없음. 메모리 누수 방지를 위해 `sidepanel` 이 닫힐 때 일괄 호출하는 훅 추가 검토(향후).
6. **키보드 포커스 관리**: 탭 키로 현재 패널 내부 첫 포커스 가능 요소로 진입하는 플로우 테스트.

---

## 검증 방법 (권장)

```bash
# XSS 체크
grep -rn "\.innerHTML\s*=\|\.outerHTML\s*=\|insertAdjacentHTML" extension/sidepanel/panel.html extension/sidepanel/panel.js

# 탭 메타 일관성 — 6 탭 동일 개수 확인
grep -c "data-tab=" extension/sidepanel/panel.html    # → 6
grep -c "data-panel=" extension/sidepanel/panel.html  # → 6
grep -c "{ id:" extension/sidepanel/panel.js          # → 6

# 해시 라우팅 동작 테스트
# chrome://extensions 재로드 후:
#   1) sidepanel 열기 → analyze 활성
#   2) #generate 로 hash 변경 → generate 탭 전환
#   3) ←/→ 로 탭 순회
#   4) 로그인 상태에서 avatar 클릭 → mypage 탭 전환
```

---

## Summary

- **수정 2개 파일** (panel.html, panel.js). 다른 파일 미변경.
- 6탭 구조(분석/벤치마크/생성/학습/도구/마이) + 이모지 + 키보드 a11y + URL hash 라우팅.
- 헤더 유저 슬롯(`onAuthChange` 구독, 아바타↔로그인 버튼 동적 전환).
- 푸터 버전·도움말 링크.
- lazy mount + 시그니처 정규화(`mountXxxTab` vs `mount`) + try-catch fallback.
- `innerHTML`/외부 라이브러리/`panel.css` 수정 **0건**. 개별 파일 500줄 이하.
- `__panel` export 로 테스트/외부 제어 API 노출(window 오염 없음).

요약 문서: `_workspace/ui_panel_summary.md`
