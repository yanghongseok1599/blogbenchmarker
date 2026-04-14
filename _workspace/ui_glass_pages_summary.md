# UI Glass Pages — 글래스모피즘 + 이모지 제거 요약

> 작성일: 2026-04-14
> 작성자: ui-builder 에이전트
> 범위: 사이드패널 외 4개 독립 페이지(auth / mypage / admin / payments)
> 횡단 QA: `_workspace/qa-scripts/run-all.sh` → **5/5 PASS** (회귀 없음)

---

## 1. 산출 파일

| # | 파일 | 이전 | 현재 | 상태 |
|--:|---|---:|---:|:-:|
| 1 | `extension/auth/auth.css` | 504 | **497줄** | ✅ ≤500 |
| 2 | `extension/auth/login.html` | 71 | 70줄 | ✅ 🔗 이모지 제거 |
| 3 | `extension/mypage/mypage.css` | 508 | **483줄** | ✅ ≤500 |
| 4 | `extension/admin/admin.css` | 500 | **479줄** | ✅ ≤500 |
| 5 | `extension/payments/checkout.html` | 357 | **448줄** | ✅ ≤500 |

**수정 규칙 준수:**
- `.js` 파일 미수정 (innerHTML 금지 규칙)
- 기존 클래스명 100% 유지
- Tailwind 0건
- `extension/sidepanel/` 미수정

---

## 2. 디자인 토큰 (4개 파일 동일 재선언)

```css
--bg-mesh:        radial-gradient(...) × 3 + 베이스 #f5f6fa
--glass-bg:       rgba(255, 255, 255, 0.58)
--glass-bg-strong: rgba(255, 255, 255, 0.72)
--glass-border:   rgba(255, 255, 255, 0.35)
--glass-border-strong: rgba(255, 255, 255, 0.55)
--glass-shadow:   0 10px 40px rgba(15, 15, 30, 0.08)
--glass-shadow-lg: 0 20px 60px rgba(15, 15, 30, 0.12)

--text-primary:   #1a1a1d
--text-secondary: #525256
--text-tertiary:  #8a8a8d

--brand: #2563eb  --brand-hover: #1d4ed8  --accent: #7c3aed
--success: #16a34a  --warn: #d97706  --danger: #dc2626

--radius-sm: 8px  --radius-card: 16px  --radius-pill: 999px
--blur: 22px
```

Admin 전용 추가: `--admin-header-bg: rgba(15, 23, 42, 0.92)` + `--admin-indicator: #ef4444` + `--font-mono`.

**폰트 스택:** Pretendard Variable → Pretendard → Apple SD Gothic Neo → Noto Sans KR → 시스템 폴백.

---

## 3. 다크모드 지원

모든 4개 파일에 `@media (prefers-color-scheme: dark)` 블록으로 전체 토큰 재매핑:
- `--glass-bg: rgba(22, 22, 28, 0.55)`
- `--glass-border: rgba(255, 255, 255, 0.08)` (얇고 밝게)
- `--text-primary: #f4f4f5`
- `--brand: #60a5fa` (blue-400 — 어둠 대비 밝게)
- `--accent: #c084fc`
- bg-mesh 도 어둡고 채도 낮은 그라디언트로 재구성

---

## 4. 페이지별 Glass 적용

### 4.1 auth.css (로그인/가입/재설정 공용)
| 요소 | Glass 처리 |
|---|---|
| `body.auth-body` | mesh gradient 배경 + `background-attachment: fixed` |
| `.auth-card` | `backdrop-filter: blur(22px) saturate(180%)` + rgba(255,255,255,0.58) + glass-border + shadow-lg + `::before` 반사광 |
| `.auth-input` | 투명 배경(rgba 0.45) + glass border → focus 시 4px primary ring |
| `.auth-btn--primary` | Dark solid (`--text-primary`) + 그림자 |
| `.auth-btn--secondary` (Google) | Glass variant (backdrop-blur + glass-bg-strong) |
| `.auth-btn--google::before` | CSS-only G 마크 (4색 conic-gradient + 내부 흰 원) |
| `.auth-banner`, `.auth-notice`, `.auth-message` | 반투명 semantic 배경 + glass border + blur(10px) |
| `.auth-header::before` | 로고 배지 (Blue→Purple 그라디언트, 44×44) |

**HTML 수정:** `login.html:55` 의 `<span aria-hidden="true">🔗</span>` **제거**. `.auth-btn--google` 클래스를 추가해 CSS-only G 마크로 대체.

### 4.2 mypage.css (대시보드)
| 요소 | Glass 처리 |
|---|---|
| `body` | mesh gradient 배경 |
| `.bbmp-topbar` | glass 상단 바 (blur 22px) + sticky |
| `.bbmp-card` | glass 카드 + `::before` 반사광 + `:hover` shadow-lg 전환 |
| `.bbmp-card--plan[data-plan="pro\|unlimited"]::after` | `mask-composite` 트릭으로 **gradient border** (카드 배경은 유지하면서 테두리만 Blue→Purple) |
| `.bm-gauge__track` | 반투명 rgba 트랙 + fill 5색 semantic |
| `.bm-expiry--info/warn/danger/expired` | 4단 차등 glass tint (info=brand-soft, warn=warn-soft, danger=danger-soft + 외곽 링, expired=glass-bg-strong) |
| `.bbmp-barchart__*` | SVG fill 토큰화 |
| `.bbmp-profile__avatar` | gradient + 그림자 강조 |

### 4.3 admin.css (관리자 콘솔)
| 요소 | Glass 처리 |
|---|---|
| `body` | 중성적 어두운 mesh (관리자 모드 시각 구분) |
| `.ad-header` | `--admin-header-bg: rgba(15, 23, 42, 0.92)` + blur 22px + sticky |
| `.ad-title::before` | **관리자 모드 표시자** — 빨간 점 + 펄스 애니메이션 (`adPulse` 2s) |
| `.ad-tabs` | glass 컨테이너 안의 알약 탭. 활성 탭은 dark solid |
| `.ad-table`, `.ad-details`, `.ad-banwords` | glass 카드 + `::before` 반사광 |
| `.ad-row:hover` | glass-bg-strong 호버 피드백 |
| `.ad-btn` (기본) | glass + backdrop-blur 10px |
| `.ad-btn--primary` | dark solid + shadow |
| `.ad-btn--danger` | danger-soft 배경 + 빨간 테두리 |
| `.ad-input` | 투명 + glass border |
| `.ad-plan[data-plan="pro\|unlimited"]` | solid brand / gradient |

### 4.4 checkout.html (인라인 글래스)
| 요소 | Glass 처리 |
|---|---|
| `body` | mesh gradient 배경 |
| `.bm-checkout__plan` | glass 카드 + `::before` 반사광 + hover shadow-lg 전환 |
| `.bm-checkout__plan:has(input:checked)` | `mask-composite` gradient border (2px) + 4px ring + shadow-lg |
| `.bm-checkout__gateway` | glass 패널 |
| `.bm-checkout__gateway h2::before` | **텍스트 배지 "SAFE"** (이모지 🔒 제거 완료, success-soft 배지로 대체) |
| `.bm-checkout > .bm-btn--primary` | Brand gradient + 대형 shadow + `::after` 화살표 + hover translateX |
| `.bm-checkout__status` | glass 배너 (backdrop-blur 10px) |
| 진입 애니메이션 | `.bm-checkout > *` nth-child stagger (40ms) |

---

## 5. 이모지 제거

| 위치 | 이전 | 이후 |
|---|---|---|
| `login.html:55` | `<span aria-hidden="true">🔗</span>` + `auth-btn--secondary` | `auth-btn--secondary auth-btn--google` 클래스만, CSS `::before` G 마크 |
| `checkout.html:237` | `content: "🔒";` (h2 prefix) | `content: "SAFE";` 텍스트 배지 (success-soft 배경) |

**전수 검사:**
```
python3 emoji pat [U+1F300-U+1FAFF, U+2600-U+27BF] on all 9 CSS/HTML files → 0 hits
```

---

## 6. italic 전면 금지

각 CSS/인라인 `<style>` 에 다음 전역 규칙 1줄씩:
```css
*, em, i, cite, address, dfn, var { font-style: normal !important; }
```

User agent default 로 italic 처리되는 태그(`<em>`, `<i>`, `<address>`, `<cite>`, `<var>`, `<dfn>`) 를 roman 으로 강제. HTML 미수정.

확인: `grep "font-style" 대상파일` → 4건 모두 `normal !important` 만 매치.

---

## 7. backdrop-filter Fallback

모든 glass 요소에 `@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px)))` 블록으로 불투명도 상향 대체:
```css
.auth-card { background: rgba(255, 255, 255, 0.92); }
@media (prefers-color-scheme: dark) {
  .auth-card { background: rgba(22, 22, 28, 0.92); }
}
```

Chrome 88+(MV3 최소 요구) 에서는 `backdrop-filter` 지원 → fallback 실제 경로는 극히 드묾. 그러나 render fallback 모드·접근성 옵션 환경 대비.

---

## 8. 호환성 / 주의

### 8.1 `:has()` (checkout.html)
- `.bm-checkout__plan:has(input[type="radio"]:checked)` — Chrome 105+ (2022).
- MV3 확장은 Chrome Web Store 최신 지원을 가정 — 안전.

### 8.2 `mask-composite` (mypage `.bbmp-card--plan::after`, checkout `.bm-checkout__plan`)
- `-webkit-mask-composite: xor` + `mask-composite: exclude` 조합.
- Safari / Chromium 모두 지원.

### 8.3 `accent-color`
- Chrome 93+ — 체크박스/라디오 브랜드 색 반영.

### 8.4 `backdrop-filter` 성능
- 큰 카드(전체 폭) 에 blur(22px) 적용 시 paint 비용 존재. 현재 카드들은 모두 `max-width: 960~1200px` 제한. 주의할 영역 없음.

---

## 9. 횡단 QA 결과 (회귀 확인)

```
✅ PASS: 5/5
❌ FAIL: 0/5

🎉 모든 횡단 BLOCKER 검사 통과!
```

- check-hardcoded-keys ✅
- check-dom-unsafe ✅ (HTML 1건 + CSS 4건 수정만 — 위험 DOM 패턴 0건 유지)
- check-rls-enabled ✅
- check-email-admin ✅
- check-sw-async-return ✅

**innerHTML 금지 규칙:** CSS / HTML (`<span>` 1개 제거) 만 수정. 어떤 `.js` 도 미수정.

---

## 10. 후속 권장

1. **토큰 단일화** — 4파일 중복 `:root` 블록을 `extension/lib/styles/tokens.css` 로 추출 + 각 HTML `<link>` 선행 로드. 현재는 단일 페이지 독립성 유지를 위해 의도적 복제.
2. **Pretendard Variable 번들링** — `extension/lib/fonts/Pretendard-Variable.woff2` 벤더링 + `@font-face` 로 CSP 호환 로컬 로드. 현재는 사용자 OS 설치 의존.
3. **다크 모드 수동 토글** — OS 자동 감지만 현재 구현됨. 사용자가 명시적으로 라이트/다크 선택할 수 있는 UI 토글은 각 페이지 HTML + JS 수정 필요(별도 라운드).
4. **backdrop-filter 성능 프로파일링** — Chrome DevTools → Performance 패널에서 카드 hover 시 paint 비용 측정.
5. **icons.js 경유** — 현재 모든 아이콘/배지는 CSS pseudo-element 로 구현. 추후 `extension/lib/icons.js` 가 생성되면 SVG inline 전환 고려 (현재는 `.js` 편집 금지 범위 외).

---

## 11. 파일 줄수 (500줄 제한 준수)

| 파일 | 줄수 | 상태 |
|---|---:|:-:|
| auth.css | 497 | ✅ |
| mypage.css | 483 | ✅ |
| admin.css | 479 | ✅ |
| checkout.html | 448 | ✅ |

모두 ≤500.
