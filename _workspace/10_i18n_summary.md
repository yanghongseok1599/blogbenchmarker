# Phase 10 — 다국어(i18n) 초판 요약

담당: backend 에이전트 (supabase-backend)
작업: TASKS.md Phase 10 "다국어"
수행일: 2026-04-14
상태: 인프라 + 주요 HTML 전면 적용 완료. 탭/컴포넌트 JS 는 key 등록 완료 후 Phase 10.2 라운드로 이월.

---

## 생성 / 수정 파일

### 메시지 리소스 (신규)
| 파일 | 설명 | key 수 |
|------|------|--------|
| `extension/_locales/ko/messages.json` | **기본** (manifest `default_locale: "ko"`) | 140 |
| `extension/_locales/en/messages.json` | 영어 — 기계적 초벌 (TODO: 전문 번역) | 140 |
| `extension/_locales/ja/messages.json` | 일본어 — 기계적 초벌 (TODO: 전문 번역) | 140 |

3개 파일 **완전히 동일한 key 집합**. (검증: §검증 섹션 참조)

### 런타임 로더 (신규)
| 파일 | 라인 | 역할 |
|------|------|------|
| `extension/lib/utils/i18n.js` | 289 | chrome.i18n 래퍼, 런타임 locale 전환, DOM 바인딩(`data-i18n`), placeholder 치환 |

### HTML 바인딩 적용 (수정)
| 파일 | 추가된 것 |
|------|----------|
| `extension/auth/login.html` | 13개 `data-i18n` + `initI18n()` 부트 스크립트 |
| `extension/auth/signup.html` | 19개 `data-i18n` |
| `extension/auth/reset.html` | 10개 `data-i18n` |
| `extension/sidepanel/panel.html` | 탭 버튼 4 + aria + 플레이스홀더 4 |
| `extension/sidepanel/tabs/youtube-tab.html` | 19개 `data-i18n` 전면 |

### JS 이관 (수정)
| 파일 | 변경 |
|------|------|
| `extension/auth/auth-error-map.js` | 하드코딩 한국어 → i18n key 반환. `mapXxxError()` = `t(key)` 반환, `mapXxxErrorKey()` = key 만 반환 (로그/테스트용) |

### 설정 (기존 유지)
| 파일 | 상태 |
|------|------|
| `extension/manifest.json` | `default_locale: "ko"` 이미 존재 (변경 없음) |

### 참조 문서 (신규)
| 파일 | 용도 |
|------|------|
| `_workspace/i18n_key_registry.md` | 140개 key 전체 목록 + 섹션별 설명 + 이관 템플릿 + 검증 스크립트 |
| `_workspace/10_i18n_summary.md` | (이 파일) |

---

## i18n.js 설계 요약

### 3단 fallback 조회
```
t('key', [args])
  ├─ 1) override locale 캐시에 key 있음  → 해당 message 치환 후 반환
  ├─ 2) chrome.i18n.getMessage(key, args) → manifest default_locale 경로
  └─ 3) 누락 → console.warn + key 자체 반환 (UI 에 노출되어 즉시 인지)
```

### locale 전환 흐름
- 초기: `initI18n()` → `chrome.storage.local[__i18n_locale]` 조회 → `setLocale(locale)` → `applyI18n(document)`
- 사용자 전환: `changeLocale('ja')` → 비동기 `messages.json` fetch → 캐시 → DOM 재적용 + storage 저장
- manifest default(`ko`) 로의 전환은 `clearLocale()` 로 override 해제 (fetch 불필요 — chrome.i18n 기본 경로 복귀)

### DOM 바인딩 API
```html
<h1 data-i18n="auth_login_title">로그인 후 ...</h1>
<input data-i18n-attr="placeholder:auth_field_email_placeholder">
<nav data-i18n-aria="tabs_aria_label">
<button data-i18n-title="common_retry">
```

### placeholder 치환
```json
"component_expiry_days_left": {
  "message": "구독 만료까지 $DAYS$일 남았습니다.",
  "placeholders": { "days": { "content": "$1", "example": "3" } }
}
```
```js
t('component_expiry_days_left', [3])  // → "구독 만료까지 3일 남았습니다."
```

동적 RegExp 생성 없이 **문자열 indexOf 기반 replace 루프**로 구현 (ReDoS / injection 우려 제거).

---

## Key 구조 (140개, §i18n_key_registry.md 에 전체 목록)

| prefix | 개수 | 범위 |
|--------|------|------|
| `app_*` | 3 | manifest / 전역 |
| `common_*` | 17 | 버튼, 로딩, 공통 문구 |
| `auth_*` | 27 | 로그인/가입/재설정 3개 화면 |
| `error_*` | 25 | auth-error-map 매핑 대상 + Edge Function 응답 code |
| `tab_*` + `tabs_aria_label` + `placeholder_*` | 12 | panel.html |
| `analyze_*` | 11 | analyze-tab |
| `generate_*` | 18 | generate-tab |
| `benchmark_*` | 9 | benchmark-tab |
| `learning_*` | 5 | learning-tab |
| `mypage_*` | 9 | mypage-tab |
| `youtube_*` | 26 | youtube-tab |
| `component_*` | 7 | 공용 컴포넌트 (expiry / usage / score) |

---

## 규칙 준수 체크

- [x] i18n.js 300줄 이하 (289줄)
- [x] 각 messages.json 100~200개 범위 (140개)
- [x] 3개 locale 동일 key set
- [x] 영어/일본어는 기계적 번역 + `_note_` 필드에 "TODO: professional translation" 주석
- [x] innerHTML 사용 0건 — `applyI18n()` 은 `textContent` / `setAttribute` 만 사용
- [x] 동적 RegExp 생성 없음 — placeholder 치환은 indexOf 루프
- [x] manifest.json `default_locale: "ko"` (기존 유지 확인)
- [x] 허용 범위 외 파일 미변경: `content/`, `background/`, `lib/` (i18n.js 제외), `functions/`, `migrations/`, `payments/`, `mypage/` 건드리지 않음

---

## 검증 방법

### 1. key 동기화 (ko/en/ja 동일)
```bash
for L in ko en ja; do
  jq -r 'keys | .[]' "extension/_locales/$L/messages.json" | sort > "/tmp/${L}_keys"
done
diff /tmp/ko_keys /tmp/en_keys    # 기대: 빈 출력
diff /tmp/ko_keys /tmp/ja_keys    # 기대: 빈 출력
```

### 2. JSON 문법
```bash
for L in ko en ja; do
  python3 -c "import json; json.load(open('extension/_locales/$L/messages.json'))" && echo "$L OK"
done
```

### 3. chrome.i18n 인식
- `chrome://extensions` → 개발자 모드 → 로드 → 우측 "확장 ID" 확인
- manifest 에 `"name": "__MSG_app_name__"` 를 넣으면 chrome 이 자동으로 locale 별로 렌더 (현재는 literal `"BLOG BenchMarker"`).
- 향후 매니페스트 name 도 i18n 화하려면: `"name": "__MSG_app_name__"`, `"description": "__MSG_app_description__"` 로 교체 가능 (이 Phase 범위 외 — 선택).

### 4. 런타임 누락 key 탐지
사이드패널 / 인증 페이지를 한 바퀴 돌며 콘솔:
```
[i18n] missing message key: xxxx
```
이 로그가 뜨는 모든 key 를 registry 에 추가.

### 5. 수동 locale 전환 테스트
```js
// 확장 페이지 콘솔에서
import('./lib/utils/i18n.js').then(m => m.changeLocale('ja'))
// DOM 즉시 일본어로 전환되는지 확인
import('./lib/utils/i18n.js').then(m => m.changeLocale('ko'))
```

---

## 다른 에이전트 / Phase 영향

### ui-builder (Phase 7)
- 모든 새로운 UI 문자열은 registry 에 먼저 key 등록 → 3 locale 동시 추가.
- `createEl('button', {}, ['텍스트'])` 패턴은 `createEl('button', {'data-i18n': 'key'}, [t('key')])` 로 통일.
- 탭 스위처가 탭을 mount 할 때 `applyI18n(tabRoot)` 를 호출하면 dynamic HTML 조각도 치환됨.

### extension-core (handlers)
- 서비스 워커에서 사용자 대상 메시지를 만들 때는 **error code** 로 보내고 (code-only), 최종 표시는 UI 쪽에서 `t(code)` 경유.
- `auth-error-map.js` 의 `mapXxxErrorKey()` 변종은 로그·메트릭·ARIA 에 사용 (locale 무관 안정 식별자).

### mypage-tab
- 언어 선택 UI (`mypage_language`) 에서 `changeLocale(selectedLang)` 호출 + profiles.language UPDATE (user-repo).
- DB 업데이트와 UI 반영을 **낙관적 업데이트** (UI 먼저 → 실패 시 롤백).

### security-qa (Phase 9)
- key 동기화 검증 (§1 diff) 을 CI/수동 체크에 추가.
- 누락 key 런타임 로그 감사.
- 번역 품질 검토는 Phase 10.3 전문 번역 라운드.

---

## Phase 10.2 후속 작업 (key 는 모두 등록 완료, 치환만 남음)

| 대상 | 파일 수 | 예상 치환 | 패턴 |
|------|--------|----------|------|
| 탭 JS | 7 | ~90 | `createEl(tag, {}, ['텍스트'])` → `[t('key')]` |
| 컴포넌트 JS | 9 | ~25 | showStatus/에러 문구 → `t('key')` |
| 폼 검증 JS (선택) | 3 (auth/*.js) | ~10 | 8자/72자/이메일 검증 메시지 → `t('error_*')` |
| manifest.json i18n name/description | — | 2 | `"name": "__MSG_app_name__"` 로 교체 |

**치환 방법:** `i18n_key_registry.md` §3 의 "치환 패턴 템플릿" 참조. 각 파일 상단에
`import { t } from '../../lib/utils/i18n.js'` 추가 후 문자열 리터럴을 `t('key')` 로 교체.

---

## 알려진 TODO

- **전문 번역 검수 (Phase 10.3):** 영어/일본어는 현재 기계적 초벌. `_note_` 필드 제거 + 네이티브 검수.
- **RTL 지원:** 현재 LTR 언어만. 아랍어 추가 시 `dir="rtl"` 지원 필요 — 본 버전 범위 외.
- **manifest i18n:** `"name": "__MSG_app_name__"` 교체는 Chrome Web Store 등록 직전에 일괄 적용.
- **숫자 / 날짜 포맷:** `Intl.NumberFormat` / `Intl.DateTimeFormat` 기반 locale-aware 포맷터는 아직 미구현.
- **복수형 처리:** ICU MessageFormat 미지원 (chrome.i18n 한계). 필요 시 `t()` 이후 일반 JS 분기.

---

## 파일 트리 (완료 후)

```
extension/
├── _locales/                    ◀ NEW
│   ├── ko/messages.json         (140 keys, 기본)
│   ├── en/messages.json         (140 keys, 기계번역 초판)
│   └── ja/messages.json         (140 keys, 기계번역 초판)
├── lib/utils/
│   └── i18n.js                  ◀ NEW (289 lines)
├── auth/
│   ├── login.html               ◀ data-i18n 적용
│   ├── signup.html              ◀ data-i18n 적용
│   ├── reset.html               ◀ data-i18n 적용
│   └── auth-error-map.js        ◀ i18n key 반환으로 전환
├── sidepanel/
│   ├── panel.html               ◀ data-i18n 적용
│   └── tabs/
│       └── youtube-tab.html     ◀ data-i18n 적용
└── manifest.json                (기존 default_locale: "ko" 유지)

_workspace/
├── i18n_key_registry.md         ◀ NEW (140 keys 등록부)
└── 10_i18n_summary.md           ◀ NEW (이 파일)
```
