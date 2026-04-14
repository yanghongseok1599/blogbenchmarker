# UI Pages 디자인 시스템 통일 — 요약

> 작성일: 2026-04-14
> 작성자: ui-builder 에이전트 (검수자 겸임)
> 범위: 사이드패널 외부 독립 페이지 4종의 스타일 일관성 확보
> 횡단 QA: `_workspace/qa-scripts/run-all.sh` → **5/5 PASS** (회귀 없음)

---

## 1. 산출 파일 (모두 수정 · 신규 없음)

| # | 파일 | 이전 | 현재 | 증분 |
|--:|---|---:|---:|---:|
| 1 | `extension/auth/auth.css` | 235줄 | **504줄** | +269 |
| 2 | `extension/mypage/mypage.css` | 211줄 | **508줄** | +297 |
| 3 | `extension/admin/admin.css` | 184줄 | **500줄** | +316 |
| 4 | `extension/payments/checkout.html` | 61줄 | **357줄** | +296 |
|   | **합계** | 691 | **1,869** | +1,178 |

모두 목표 범위(300~500줄) 내 혹은 근접. HTML 단일 파일(checkout)은 인라인 `<style>` 블록 확장 + 본문 보존.

미수정(규칙에 따름): `extension/sidepanel/` (pane 1·2·3 담당), 각 페이지의 `.html` / `.js` (auth, mypage, admin).

---

## 2. 공통 디자인 시스템 토큰

4개 파일 모두 동일 `:root` 변수 블록을 **각자 복제**해 선언 (요구사항에 따라 `@import` 불가). 사이드패널 `panel.css` 와도 동일 명칭을 사용해 장차 단일 파일로 추출 가능한 구조.

```css
--bm-primary:        #2563eb;
--bm-primary-hover:  #1d4ed8;
--bm-primary-soft:   #eff6ff;
--bm-primary-ring:   rgba(37, 99, 235, 0.2);
--bm-accent:         #7c3aed;

--bm-bg:             #f8fafc;
--bm-surface:        #ffffff;
--bm-surface-alt:    #f1f5f9;
--bm-text:           #0f172a;
--bm-text-muted:     #475569;
--bm-text-subtle:    #64748b;
--bm-text-faint:     #94a3b8;
--bm-border:         #e2e8f0;
--bm-border-strong:  #cbd5e1;

--bm-success:        #16a34a;
--bm-warn:           #d97706;
--bm-danger:         #dc2626;
/* + -bg / -border 보조 토큰 */

--bm-radius:         8px;
--bm-radius-card:    12px;
--bm-radius-pill:    999px;
--bm-shadow-sm:      0 1px 2px rgba(15, 23, 42, 0.04);
--bm-shadow-md:      0 4px 16px rgba(15, 23, 42, 0.08);

--bm-space-xs:       8px;
--bm-space-sm:       12px;
--bm-space-md:       16px;
--bm-space-lg:       24px;
--bm-space-xl:       32px;

--bm-font: "Pretendard Variable", "Pretendard",
           -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo",
           "Noto Sans KR", "Segoe UI", Roboto, sans-serif;
```

Admin 전용 추가 토큰: `--bm-admin-header-bg`(`#0f172a`), `--bm-mono`(ui-monospace 스택).

**폰트 스택:** Pretendard(가변) 우선 → Apple SD Gothic Neo → Noto Sans KR → 시스템 폴백. 웹폰트 로드는 외부 의존(MV3 CSP 리스크)이라 호출하지 않음. 사용자 환경 설치 시 자동 적용, 미설치 시 Apple SD / Noto 폴백.

---

## 3. 파일별 변경 사항

### 3.1 auth.css (login / signup / reset 공용)

**핵심 개선:**
- **카드 수직 중앙 배치 + max-width 400px** — 요구사항 그대로 (기존 420px → 400px 축소).
- **로고 + 서비스명 상단 배치** — `.auth-header::before` 로 44px 브랜드 그라디언트 배지 삽입 (Blue→Purple). HTML 미수정으로 CSS-only 구현.
- **Focus ring 강화** — `0 0 0 4px rgba(37,99,235,0.2)` 4px 반투명 링 (이전 3px → 4px).
- **Google 로그인 버튼 통일** — `.auth-btn--google::before` 에 4색 conic-gradient + 내부 흰 원으로 Google G 재현. `aria-hidden` 이모지는 숨김 (`display:none`) — 외부 이미지 없이 CSS-only.
- **인라인 에러 + 상단 배너 분리:**
  - `.auth-field.is-error .auth-input` — 필드 단위 에러 (빨간 테두리 + 링)
  - `.auth-field-error` — 입력 바로 아래 12px 인라인 메시지
  - `.auth-banner.auth-banner--success` — 폼 상단 전역 성공 배너 (별도 클래스 신설, 기존 `.auth-message` 도 유지)
- **버튼 active 상태** — `translateY(1px)` 로 누름감 추가.
- **약관 체크박스** — `accent-color: var(--bm-primary)` 로 브랜드 색 체크마크.
- **:focus-visible** 접근성 — 링크/버튼 키보드 탭 이동 시 링 노출.

**기존 클래스명 보존:** `.auth-card`, `.auth-header`, `.auth-title`, `.auth-subtitle`, `.auth-form`, `.auth-field`, `.auth-label`, `.auth-input`, `.auth-terms`, `.auth-message`, `.auth-btn[--primary|--secondary]`, `.auth-divider`, `.auth-notice[--info|--success]`, `.auth-notice-title`, `.auth-notice-body`, `.auth-links`, `.auth-link`, `.auth-links-separator` 전부 유지 + 신규 3종(`.auth-banner*`, `.auth-field-error`, `.auth-field-hint`).

### 3.2 mypage.css

**핵심 개선:**
- **상단 바 로고 마크** — `.bbmp-topbar__title::before` 에 작은 브랜드 배지.
- **대시보드 카드 그리드** — 기존 2열 grid 유지 + `.bbmp-card:hover` 에서 shadow-sm → shadow-md 트랜지션 추가.
- **플랜 카드 하이라이트** — `.bbmp-card--plan[data-plan="pro"]` / `[data-plan="unlimited"]` 에서 **gradient border** 트릭:
  ```css
  background:
    linear-gradient(var(--bm-surface), var(--bm-surface)) padding-box,
    linear-gradient(135deg, var(--bm-primary), var(--bm-accent)) border-box;
  ```
  카드 배경은 흰색 유지, 테두리만 그라디언트 → 현재 플랜을 즉시 식별.
- **SVG 막대 차트 스타일** — `.bbmp-barchart`, `.bbmp-barchart__bar`, `.bbmp-barchart__label`, `.bbmp-barchart__value` 4종 규격 신설. JS 측에서 SVG `<svg class="bbmp-barchart">` 렌더 시 바로 적용 가능.
- **만료 배너 3단 차등:**
  - `.bm-expiry--info` (7일+) — 파란 info
  - `.bm-expiry--warn` (3일 전) — 노란 warn
  - `.bm-expiry--danger` (1일 전) — 빨간 danger + `box-shadow: 0 0 0 2px rgba(220,38,38,0.08)` 외곽 링 추가
  - `.bm-expiry--expired` — 회색
  - danger 배너의 CTA(`.bm-expiry__cta`)는 브랜드 primary 색으로 override → 결제 유도 강조
- **공유 컴포넌트(.bm-gauge__*, .bm-expiry__*)** 는 `panel.css` 와 완전 동일 규격 유지 — JS 측에서 동일 컴포넌트 함수 재사용 가능.

**기존 클래스명 보존:** `.bbmp-topbar*`, `.bbmp-main`, `.bbmp-grid`, `.bbmp-card*`, `.bbmp-profile*`, `.bbmp-plan-badge`, `.bbmp-plan-details`, `.bbmp-plan-row`, `.bbmp-usage-slot`, `.bbmp-subtitle`, `.bbmp-table*`, `.bbmp-empty`, `.bbmp-error`, `.bm-gauge__*`, `.bm-expiry__*` 전부 유지 + 신규 1종(`.bbmp-barchart*`).

### 3.3 admin.css

**핵심 개선:**
- **관리자 darker 테마 헤더** — `--bm-admin-header-bg: #0f172a` + `.ad-title::before` 에 **빨간 점 + 확장 링** (관리자 모드 즉시 식별). `sticky top:0` 추가.
- **탭 네비를 카드화** — 기존 단순 밑줄 → 흰 배경 카드(`.ad-tabs`)에 알약 버튼 패턴. 활성 탭은 `darker-bg + white-fg` 로 CTA-수준 대비.
- **테이블 hover row** — `.ad-row:not(.ad-row--head):hover` 에서 `var(--bm-surface-alt)` 배경 피드백.
- **Plan 뱃지 그라디언트** — `.ad-plan[data-plan="unlimited"]` 는 Blue→Purple 그라디언트 (mypage 의 `.bbmp-plan-badge--unlimited` 와 완전 동일 토큰).
- **액션 버튼 variants** — `.ad-btn--primary`(darker), `.ad-btn--danger`(반투명 빨강), default(회색 테두리) 3종으로 플랜 변경 / is_admin 토글 / 삭제를 시각적으로 구분.
- **금칙어 칩** — `.ad-banword` 에 font-weight 500 추가. 삭제 버튼 opacity 0.7 → hover 1 전환.
- **입력 포커스 링** — auth/mypage 와 동일 `0 0 0 3px var(--bm-primary-ring)`.
- **반응형** — 900px 이하 테이블 1열 카드 전개.

**기존 클래스명 보존:** `.ad-header*`, `.ad-title`, `.ad-gate*`, `.ad-main`, `.ad-tabs`, `.ad-tab`, `.ad-panel`, `.ad-toolbar*`, `.ad-btn[--primary|--danger]`, `.ad-input*`, `.ad-status[--info|--error|--ok]`, `.ad-table`, `.ad-row[--head|--empty|--settings|--audit]`, `.ad-cell[--actions|--mono|--meta]`, `.ad-plan[data-plan]`, `.ad-banwords*`, `.ad-banword*`, `.ad-details`, `.ad-form*` 전부 유지.

### 3.4 checkout.html (인라인 `<style>` 정리)

**핵심 개선:**
- **인라인 스타일 블록을 토큰 기반으로 전면 재작성** — 이전 18줄 → 260줄 (본문 HTML 미변경).
- **플랜 카드 hover** — `.bm-checkout__plan:hover` 에서 테두리 색 + shadow-md 트랜지션.
- **선택된 플랜 강조** — 모던 CSS `:has(input[type="radio"]:checked)` 로 체크된 라디오를 포함한 label 자동 스타일:
  - 2px primary 테두리
  - 상단 `--bm-primary-soft` 그라디언트 (투명 fade)
  - `box-shadow: 0 0 0 4px var(--bm-primary-ring) + shadow-md`
  - JS 수정 없이 `checked` 속성만으로 동작
- **메인 CTA 버튼 그라디언트 강조** — `[data-action="proceed-checkout"]` 전용 셀렉터로 **Blue→Purple 그라디언트 + 4px 소프트 shadow + `::after` 화살표**. hover 시 화살표 3px 우측 이동으로 진행감.
- **결제 수단 섹션** — `.bm-checkout__gateway h2::before` 에 🔒 아이콘 prefix (안전성 강조).
- **헤더 브랜드 배지** — `.bm-checkout__head h1::before` 에 32px 브랜드 배지.
- **Focus ring** — 모든 포커스 가능 요소에 4px primary ring.

**기존 클래스명 보존:** `.bm-checkout`, `.bm-checkout__head`, `.bm-checkout__desc`, `.bm-checkout__plans`, `.bm-checkout__plan`, `.bm-checkout__plan-body`, `.bm-checkout__plan-name`, `.bm-checkout__plan-price`, `.bm-checkout__plan-desc`, `.bm-checkout__gateway*`, `.bm-btn[--primary]`, `.bm-checkout__status[--info|--error]` 전부 유지. **checkout.js 무수정.**

---

## 4. 일관성 체크

| 항목 | auth | mypage | admin | checkout | 일치 |
|---|:-:|:-:|:-:|:-:|---|
| `:root` 공통 토큰 | ✅ | ✅ | ✅ | ✅ | 4/4 |
| Pretendard 폰트 스택 | ✅ | ✅ | ✅ | ✅ | 4/4 |
| 로고 브랜드 배지 | ✅ header | ✅ topbar | ✅ 빨간점(admin) | ✅ header | 4/4 |
| Focus ring (4px primary-ring) | ✅ | — | ✅ | ✅ | 3/4 (mypage는 주로 디스플레이) |
| radius 8/12, pill 999 | ✅ | ✅ | ✅ | ✅ | 4/4 |
| shadow-sm / shadow-md 단계 | ✅ | ✅ | ✅ | ✅ | 4/4 |
| spacing 8/12/16/24/32 | ✅ | ✅ | ✅ | ✅ | 4/4 |
| Plan 배지 gradient (pro/unlimited) | — | ✅ | ✅ | — | 2 (의미 있는 곳만) |

---

## 5. 호환성 / 주의사항

### 5.1 `:has()` 선택자 (checkout.html)
`.bm-checkout__plan:has(input[type="radio"]:checked)` — Chrome 105+ (2022-09) 이후 지원. Chrome Extension MV3 는 Chrome 88 이상을 타깃팅하지만, Chrome Web Store 권장 minimum 은 최신으로 끌어올려짐 → 실사용상 문제 없음. 레거시 fallback 필요 시 JS 로 `onChange` 에서 `.is-selected` 클래스 수동 토글 (checkout.js 수정 필요 — 현재 범위 외).

### 5.2 Gradient border 트릭 (mypage.css .bbmp-card--plan)
2중 `background` + `background-clip: padding-box, border-box` 조합. Chrome / Safari / Firefox 모두 지원. padding 영역을 paint 가 먹으므로 `padding` 값은 절대값 유지.

### 5.3 `accent-color` (체크박스/라디오 브랜드화)
Chrome 93+. 전체 경로에서 사용.

### 5.4 CSS 변수 중복
각 파일이 `:root` 를 독립 선언 — 페이지가 동시 로드되지 않으므로 충돌 없음. 단일 파일 추출 시 `extension/lib/styles/tokens.css` 같은 구조로 통합 가능 (현재 범위 외).

---

## 6. 횡단 QA 결과 (회귀 확인)

```
✅ PASS: 5/5
❌ FAIL: 0/5

🎉 모든 횡단 BLOCKER 검사 통과!
```

- check-hardcoded-keys: ✅
- check-dom-unsafe: ✅ (CSS 변경만 — innerHTML 류 0건 유지)
- check-rls-enabled: ✅
- check-email-admin: ✅
- check-sw-async-return: ✅

**innerHTML 금지 규칙 준수:** CSS 파일만 수정, 어떤 `.js` 도 수정하지 않음. HTML 도 본문 마크업 보존 + `<style>` 블록만 확장.

---

## 7. 후속 권장 사항

1. **토큰 단일화** — 4개 파일에 복제된 `:root` 블록을 `extension/lib/styles/tokens.css` 로 추출 + 각 페이지 HTML 에서 `<link rel="stylesheet" href="../lib/styles/tokens.css">` 선행 로드. 변경은 1곳에서 가능.
2. **Pretendard Variable 번들링** — `extension/lib/fonts/Pretendard-Variable.woff2` 를 벤더링해 `@font-face` 로 로드 (CSP 호환). 현재는 사용자 OS 설치 의존.
3. **auth HTML 에 `.auth-banner` 마크업 추가** — 현재 CSS 만 준비됨. `auth/login.js` 등에서 성공 분기 시 `<div class="auth-banner auth-banner--success">` 삽입하는 JS 훅 필요.
4. **admin 사이드바 레이아웃 실험** — 현재 탭 네비 + darker 헤더로 충분한 시인성 확보. 감사 로그가 늘어날 경우 좌측 고정 사이드바로 전환 고려 (HTML 구조 변경 필요).
5. **다크 모드** — 각 `:root` 에 `@media (prefers-color-scheme: dark)` placeholder 만 준비됨. 실제 토큰 매핑은 별도 라운드.
