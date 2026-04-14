# UI 이모지 제거 + 아이콘 시스템 확장 — 프론트엔드 작업 요약

작업자: 프론트엔드 에이전트
일시: 2026-04-14

---

## 수정 파일

| 경로 | 변경 |
|---|---|
| `extension/sidepanel/components/icons.js` | 탭 네비게이션용 아이콘 5종 신규 + `sparkles` alias 1종 추가. 기존 15종은 그대로. 주석 헤더 §ICON_NAMES 갱신 |
| `extension/sidepanel/panel.html` | 6개 탭 `<span class="bm-tab__icon">` 의 이모지(📊/🏆/✨/📚/🛠️/👤) → `data-icon="..."` 속성으로 치환. 빈 span |
| `extension/sidepanel/panel.js` | `icon` import 추가, `TAB_META[].icon: '이모지'` → `iconName: 'chart-bar'` 등 키 명으로 변경, `initTabIcons()` 신규(전역 `[data-icon]` 주입), 로그인 버튼의 `🔑` → `icon('key')` |
| `extension/sidepanel/components/structure-card.js` | `icon` import 추가, 체크리스트 `✓`/`!` → `icon('check')`/`icon('warning')` (로컬 변수명 `icon` → `mark` 리네임), `🖼` 제거하고 `icon('image')` + 숫자 조합으로 교체 |

---

## icons.js 추가된 6종

| name | 용도 | 구성 |
|---|---|---|
| `chart-bar` | 분석 탭 | 베이스라인(`M3 21h18`) + 3개 세로 막대(높이 8/13/5) — 높낮이로 "통계" 인식 강화 |
| `trophy` | 벤치마크 탭 | 컵 몸체 + 좌/우 손잡이(`M8 7H5a2 2 0 000 4`) + 스템 + 받침대 |
| `book-open` | 학습 탭 | 중앙 제본선(`M12 7v14`) + 좌/우 페이지 곡선 — 펼친 책 |
| `wrench` | 도구 탭 | 대각선 렌치 실루엣(Lucide 풍 단일 경로) |
| `user` | 마이 탭 | 머리 원(`cx:12 cy:8 r:4`) + 어깨/몸통 곡선(`M4 21v-1a7 7 0 0116 0v1`) |
| `sparkles` | 생성 탭 | 기존 `sparkle` 과 동일 경로 — lucide 명명 호환 alias |

모두 **24×24 viewBox · stroke 1.5 · fill:none · stroke:currentColor** 기존 패턴 유지. `createElementNS` 전용으로 `innerHTML` 미사용.

---

## panel.html 교체 패턴

```diff
- <span class="bm-tab__icon" aria-hidden="true">📊</span>
+ <span class="bm-tab__icon" data-icon="chart-bar" aria-hidden="true"></span>
```

- span 의 **클래스·aria 속성은 보존**(기존 panel.css 셀렉터 유지).
- `data-icon` 값: `chart-bar` / `trophy` / `sparkles` / `book-open` / `wrench` / `user`.
- 내부 텍스트 제거 → panel.js 의 `initTabIcons()` 가 SVG 삽입.

---

## panel.js 변경 포인트

1. **import 추가**
   ```js
   import { icon } from './components/icons.js'
   ```

2. **TAB_META 키 변경**: `icon: '📊'` → `iconName: 'chart-bar'`. HTML 의 `data-icon` 과 소스 오브 트루스를 분리하지 않기 위해 SVG 주입은 HTML 측 속성만 참조하고, `TAB_META.iconName` 은 프로그램적 접근(동적 탭 생성 등)용으로만 보존.

3. **`initTabIcons(root = document)` 신규** — `bootstrapTabs()` 최상단에서 호출.
   - `[data-icon]` 모든 span 순회.
   - `svg` 자식이 이미 있으면 skip (재진입 안전).
   - `icon(name, { size: 18, className: 'bm-icon bm-tab-icon' })` 결과 `appendChild`.
   - 미존재 아이콘은 `icons.js` 내부 fallback(점선 원) 사용 + `console.warn`.

4. **로그인 버튼**
   ```diff
   - createEl('span', { className: 'bm-header__login-icon', 'aria-hidden': 'true' }, '🔑'),
   + createEl('span', { className: 'bm-header__login-icon', 'aria-hidden': 'true' }, [
   +   icon('key', { size: 14, className: 'bm-icon' }),
   + ]),
   ```

---

## structure-card.js 변경 포인트

1. **import 추가**: `import { icon } from './icons.js'`.
2. **로컬 변수명 충돌 해소**: 기존 `checkItem()` 내부 `const icon = createEl(...)` 가 import 와 충돌 → `const mark = ...` 로 리네임.
3. **체크리스트 마커**: `ok ? '✓' : '!'` → `icon(ok ? 'check' : 'warning', { size: 14, className: 'bm-icon' })`.
4. **이미지 카운트 메타**: 기존 템플릿 문자열의 `🖼 ${s.imageCount}` 제거.
   ```js
   const metaChildren = [`${s.charCount}자`]
   if (s.imageCount) {
     metaChildren.push(
       ' · ',
       icon('image', { size: 12, className: 'bm-icon bm-icon--inline' }),
       ` ${s.imageCount}`,
     )
   }
   ```

---

## 검증 결과

```bash
# 이모지 스캔 (Unicode U+2300~U+27BF + U+1F300~U+1FAFF)
python3 scan_emoji extension/sidepanel/
# → total hits: 0

# 위험 DOM API
grep -rn "\.innerHTML\s*=\|\.outerHTML\s*=\|insertAdjacentHTML" extension/sidepanel/
# → 0건
```

### 제거 카운트

| 파일 | 제거 전 | 제거 후 |
|---|---:|---:|
| `panel.html` | 6 (📊🏆✨📚🛠️👤) | 0 |
| `panel.js` | 7 (TAB_META 6 + 🔑) | 0 |
| `structure-card.js` | 2 (✓/!은 `checkItem` 내 2개 위치 + 🖼) | 0 |
| `analyze-tab.js` | 0 (이미 `icon()` 사용 중) | 0 |
| **합계** | **15** | **0** |

### a11y 유지

- 모든 `<span class="bm-tab__icon">` 에 `aria-hidden="true"` 유지(장식).
- `bm-tab__label` 은 데이터-i18n 바인딩 텍스트로 스크린리더에 노출.
- `icons.js` 의 SVG 는 `role="img"` + `aria-hidden="true"` 기본값(title 옵션 미사용).
- 체크리스트의 `is-ok` / `is-warn` 클래스는 그대로 유지되어 기존 CSS 토큰으로 색상 제어 가능.

---

## 스코프 외 (미터치)

- `extension/auth/*`, `extension/mypage/*`, `extension/content/*`, `extension/background/*`, `extension/lib/*`, `extension/manifest.json`, `supabase/*`, `docs/*` — 모두 미변경.
- `extension/sidepanel/panel.css` — 기획자(pane 1) scope, 미변경. 다만 아래 CSS 훅이 존재해야 SVG가 올바른 크기/색상으로 보임:
  - `.bm-tab__icon svg` — `width: 18px; height: 18px; color: inherit;` 권장
  - `.bm-structure-checklist__icon.is-ok svg` — `color: var(--bm-success)`
  - `.bm-structure-checklist__icon.is-warn svg` — `color: var(--bm-warn)` 또는 `var(--bm-danger)`
  - `.bm-icon--inline` — `vertical-align: -2px` 등 텍스트 정렬

---

## 후속 작업 (이 작업 범위 외)

1. **panel.css 보완**: 기획자가 `.bm-tab__icon svg` 크기·색상·간격 세부 스타일 추가(현재는 icon() 옵션의 size=18 만 적용).
2. **다른 탭/컴포넌트 이모지 감사**: benchmark-tab.js, generate-tab.js, learning-tab.js, youtube-tab.js, tools-tab.js 등에 잔존 이모지가 있는지 추가 감사 필요(본 작업은 panel/structure-card/analyze-tab 만 대상).
3. **ICON_NAMES 유지보수**: 아이콘 추가 시 `icons.js` 상단 주석의 §ICON_NAMES 섹션 목록을 항상 동기화.
4. **다국어 라벨**: `tab_learning` / `tab_tools` / `footer_help` 키가 `_locales/{ko,en,ja}/messages.json` 에 누락 여부 재확인.

---

## Summary

- **수정 4개 파일**: `icons.js`, `panel.html`, `panel.js`, `structure-card.js`.
- **추가 아이콘 6종**: `chart-bar`, `trophy`, `book-open`, `wrench`, `user`, `sparkles`(alias). 모두 기존 stroke 1.5 패턴 유지.
- **이모지 완전 0건** 달성(주석 포함) — Python Unicode 범위 스캔으로 검증.
- `innerHTML`/`outerHTML`/`insertAdjacentHTML` 0건.
- `data-icon` 속성 기반 선언적 아이콘 주입 패턴 도입(`initTabIcons`) — 추후 HTML 에 아이콘 스팟만 선언하면 자동 렌더.
- a11y 속성(`aria-hidden` / `role="img"` / `.bm-tab__label` 텍스트) 전부 보존.

요약 문서: `_workspace/ui_emoji_removal_summary.md`
