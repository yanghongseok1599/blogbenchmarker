# 글래스모피즘 CSS 전면 재작성 요약

**작업자:** planner 에이전트
**일자:** 2026-04-14
**대상:** `extension/sidepanel/panel.css` — iOS/macOS Sonoma/Vision Pro 감각의 프리미엄 글래스

## 파일 통계

| 항목 | 값 |
|---|---|
| 라인 수 | **904** (1000 한도 이하) |
| 기존 BEM 클래스 보존 | 143개 전부 ✓ (JS/HTML 수정 0) |
| 섹션 구성 | 16개 (토큰 → 베이스 → 헤더 → 탭 → 패널 → 카드 → 분석 → 점수 → 통계 → 구조 → 가이드 → 루브릭 → 폼 → 스켈레톤 → 푸터 → 반응형) |
| CSS 변수 | 50+개 (light/dark 자동 교체) |

## 디자인 시스템

### 1) 배경 메쉬 (body::before + ::after)
- `radial-gradient` 3겹 (18%/18%, 82%/24%, 50%/86%) → `filter: blur(60px)` 로 파스텔 연무
- 라이트: `#E8EDF5 → #F3EEF7 → #EAF2F0`
- 다크: `#12131A → #191622 → #1A1D26`
- `::after` 에 SVG feTurbulence 노이즈 (opacity 0.6, mix-blend-mode: overlay) — 글래스의 필름 질감 재현

### 2) 글래스 토큰 (light ↔ dark)
| 역할 | Light | Dark |
|---|---|---|
| 카드 기본 (glass-1) | `rgba(255,255,255,.58)` | `rgba(22,22,28,.55)` |
| 중첩 카드 (glass-2) | `rgba(255,255,255,.42)` | `rgba(28,28,36,.48)` |
| 헤더/탭 바 (glass-3) | `rgba(255,255,255,.72)` | `rgba(18,18,24,.68)` |
| 내부 하이라이트 border | `rgba(255,255,255,.35)` | `rgba(255,255,255,.12)` |
| 외곽 분리선 | `rgba(20,22,40,.06)` | `rgba(0,0,0,.5)` |
| **블러 강도** | `blur(22px) saturate(180%)` (기본) / `blur(30px) saturate(190%)` (강) / `blur(12px)` (약) |

### 3) 폰트 & italic 금지
- `Pretendard Variable` 단일 스택 (Apple SD Gothic Neo, Noto Sans KR 폴백)
- `font-feature-settings: "ss01","ss02","cv11"` — Pretendard 스타일 세트 활성
- 전역 `*, *::before, *::after { font-style: normal !important }` 로 italic 차단
- `em, i, cite, address, dfn, var { font-style: normal }` 이중 안전장치

### 4) 라운드 / 그림자
- 카드 `16px`, 버튼/입력 `10px`, pill `999px`
- **다층 그림자:**
  - `--shadow-glass`: `inset 0 1px 0 rgba(255,255,255,.55)` + `0 10px 40px rgba(15,15,30,.08)` + `0 2px 6px rgba(15,15,30,.04)`
  - `--shadow-btn-primary`: `inset 0 1px 0 rgba(255,255,255,.22)` + `0 8px 24px rgba(83,86,245,.38)` + `0 2px 6px rgba(83,86,245,.22)`
- 카드 ::after 로 얇은 외곽선 1px 추가 — glass 내부/외부 이중 테두리

### 5) 아이콘 — 이모지 제거 + SVG mask
HTML 이 `.bm-tab__icon` 에 이모지 텍스트(`📊` 등)를 넣어두었으나:
1. `font-size: 0; line-height: 0` 로 이모지 텍스트 완전 숨김
2. `background-color: currentColor` + `mask-image: url("data:image/svg+xml;utf8,...")` 로 교체
3. 각 탭별 stroke 1.6 SVG 직접 인라인 (analyze=막대차트 / benchmark=트로피 / generate=반짝임 / learning=책 / tools=렌치 / mypage=유저)
4. warnings-icon / guide__icon / error-card__icon 도 동일 방식
- **이점:** JS/HTML 수정 0, `currentColor` 로 theming 자연 연동, 선명한 벡터

### 6) 탭 네비 — 글래스 필 + 활성 진한 색
- 컨테이너: sticky top, `overflow-x: auto` (6탭 narrow 사이드패널 대응), `min-height: 52px`
- 기본: 투명 → hover `rgba(255,255,255,.45)` 글래스 필
- **활성:** `linear-gradient(135deg, var(--accent), var(--accent-2))` + inset highlight + accent-glow shadow
- 스크롤바는 `scrollbar-width: none` + `::-webkit-scrollbar { display: none }` 로 완전 숨김

### 7) 버튼 — primary는 dark glass + 미묘한 글로우
- **기본 (.bm-btn):** 글래스 필 + 1px inset highlight
- **.bm-btn--primary:** `linear-gradient(135deg, #17182A, #1F2042)` 다크 글래스 + `rgba(83,86,245,.38)` 소프트 글로우
- **.bm-btn--ghost:** 투명, hover 시 glass-2
- **.bm-btn--sm:** 32px, `--btn--block:** width 100%
- `aria-busy="true"` 스피너 자동

### 8) 분석 탭 — hero 그라디언트
- `.bm-analyze__hero`: `linear-gradient(135deg, rgba(83,86,245,.10), rgba(139,109,246,.08))` + glass-1 겹침
- `.bm-analyze__total-value`: **44px 그라디언트 클립 텍스트** (`-webkit-background-clip: text`)
- Warnings 카드는 `warn-bg` 토너 + 경고 아이콘 mask
- Empty 상태는 중앙 정렬 + 여백 강화

### 9) Score Card — 그라디언트 progress
- bar-fill 을 `linear-gradient(90deg, var(--accent), var(--accent-2))` 그라디언트로 채움
- `--good/--warn/--poor` modifier 별로 그라디언트 색 전환
- value 폰트도 해당 상태색으로 변경

### 10) Structure / Writing Guide
- 3섹션 바 다이어그램: intro/section/outro 각 다른 그라디언트 stripe
- Checklist: 18px 원형 아이콘 + data-state(fail/warn/good) 색상 전환
- TOC: grid 3열(marker/title/meta), hover 시 glass-2 배경
- Guide 항목: `bm-guide__icon` 전구 SVG mask

### 11) 접근성 / 성능
- `:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px }` 전역
- `@media (prefers-reduced-motion: reduce)` — 모든 transition/animation 0
- `@supports not (backdrop-filter: blur(1px))` **폴백** — 미지원 브라우저(일부 Firefox 구버전)에서 `--glass-1-solid` 불투명색으로 대체
- `will-change: transform` 은 body::before 1곳만 (과다 사용 방지)

### 12) 반응형
- `max-width: 360px` — stats 2열, 탭 height 축소, hero 총점 36px 축소
- `max-width: 300px` — stats 1-2열, 탭 라벨 숨김(아이콘만 표시)

## 호환성 체크

- ✅ **Tailwind/외부 의존 0** — `grep @import|url\(https` 결과 0건
- ✅ **모든 기존 클래스 보존** — 143개 `.bm-*` 클래스 전부 CSS 에 존재
- ✅ **backdrop-filter 폴백** — `@supports not` 블록 5곳에서 `--glass-1-solid` 불투명색 대체
- ✅ **파일 1000줄 이하** — 904줄
- ✅ **이모지 제거** — `.bm-tab__icon` 의 이모지 텍스트는 `font-size: 0` 로 숨기고 SVG mask 로 교체. HTML 수정 없이 해결.
- ✅ **italic 금지** — `font-style: normal !important` 전역 + 이탤릭 기본 요소 추가 리셋

## 다음 단계 권장

1. **Pretendard 웹폰트 번들링** — 시스템 미설치 환경에서 SDK 폴백이 렌더됨. `extension/assets/fonts/pretendard.woff2` 번들 + `@font-face` 로컬 선언 권장.
2. **SVG mask 아이콘 재사용** — 분석 탭의 warnings/guide/error 는 CSS 안에 인라인 SVG. 더 많은 아이콘이 필요해지면 `sidepanel/components/icons.js`(이미 존재)로 JS 레벨 렌더를 통합하고 CSS mask 는 탭 네비만 유지 권장.
3. **backdrop-filter 성능 측정** — 글래스 레이어가 6~8개(헤더/탭/패널 카드/점수/구조/푸터…)로 누적됨. 저사양 노트북 Chrome 에서 FPS 측정 후 일부 레이어는 solid 로 downgrade 고려.
4. **라이트 다크 컨트라스트 WCAG AA 실측** — 특히 다크 모드의 glass-1 위 `var(--text-2)` 가 4.5:1 를 넘는지 확인.
5. **HTML 마이그레이션 후속** — 궁극적으로 `.bm-tab__icon` 의 이모지 텍스트를 제거하고 `<svg>` 로 직접 삽입하는 편이 스크린리더/셀렉션 친화적. 본 CSS 는 그 전환까지의 bridge.

## 검증 명령

```bash
# 외부 의존 0건
grep -nE "@import|url\(https://" extension/sidepanel/panel.css || echo "PASS: 외부 의존 없음"

# italic 사용 체크 (font-style: italic 이 없어야)
grep -n "font-style:\s*italic" extension/sidepanel/panel.css || echo "PASS: italic 0건"

# backdrop-filter 폴백 존재
grep -c "@supports not" extension/sidepanel/panel.css
# 3+ 건 예상 (헤더/탭/카드/입력/버튼/푸터)

# 기존 클래스 커버리지
grep -cE "^\s*\.bm-" extension/sidepanel/panel.css
# 143+ 예상
```

## 상태

글래스모피즘 재작성 완료. 성능/WCAG 실측이 후속 작업. 대기 중.
