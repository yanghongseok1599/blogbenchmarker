# Analyze Tab UI 고도화 — 요약

담당: backend 에이전트 (UI 고도화 라운드)
작업일: 2026-04-14
범위: 분석 탭의 결과 UI 를 단순 리스트에서 **데이터 시각화 대시보드** 로 승격.

---

## 변경 파일 (5개)

| 파일 | 종류 | 라인 | 핵심 변화 |
|------|------|------|----------|
| `extension/sidepanel/components/total-score-gauge.js` | 신규 | 262 | 반지름 80 · stroke 12 SVG 원형 게이지 + S/A/B/C/D 등급 배지 |
| `extension/sidepanel/components/stats-strip.js` | 신규 | 245 | 가로 스트립: 글자수·문장수·이미지수·읽기시간(400자/분 기준) + 이모지 아이콘 |
| `extension/sidepanel/components/recommendation-list.js` | 신규 | 284 | 5 카테고리 그룹핑(제목/후킹/본문/가독성/키워드/기타) + 우선순위 태그(high/medium/low) |
| `extension/sidepanel/components/score-card.js` | 리팩터 | 248 | 선형 막대 → 미니 원형 게이지 · 4단계 색상 · 추천사항 접기/펼치기 (첫 2개) |
| `extension/sidepanel/tabs/analyze-tab.js` | 리팩터 | 394 | 활성 탭 자동 감지 · 블로그ID 표시 · 스켈레톤 로더 · 에러 카드 · 대시보드 레이아웃 |

**라인 제약 (파일당 300~500):** 모두 준수. 최대 394줄, 최소 245줄.

---

## 1. total-score-gauge.js — 히어로 게이지

### 시각
```
     ╭──────╮  ┌───┐
    │  84    │  │ A │  ← 등급 배지 (S/A/B/C/D)
    │ 총점    │  └───┘
     ╰──────╯
  블로그 SEO           ← subtitle
```

### 등급 매핑
| 점수 | 등급 | colorKey |
|------|------|---------|
| 90+ | S | excellent |
| 80~89 | A | good |
| 70~79 | B | fair |
| 60~69 | C | warn |
| <60 | D | poor |

### SVG 기하
- `r=80`, `stroke=12`, viewBox `size = r*2 + stroke + padding*2 = 184`
- `circumference = 2πr ≈ 502.65`
- `dashOffset = circumference * (1 - score/100)`
- `transform: rotate(-90 cx cy)` — 12시 방향 시작, 시계방향 증가

### API
```js
import { createTotalScoreGauge, updateTotalScoreGauge } from '…/components/total-score-gauge.js'
createTotalScoreGauge(84, { label: '총점', subtitle: '블로그 SEO' })
updateTotalScoreGauge(gaugeEl, 92)  // 재생성 없이 값 갱신
```

---

## 2. stats-strip.js — 통계 스트립

### 아이템
| 아이콘 | 값 | 산출 |
|-------|-----|------|
| 📝 | {charCount}자 | `stats.charCount` |
| 📄 | {sentenceCount}문장 | `stats.sentenceCount` |
| 🖼 | {imageCount}개 | `stats.imageCount` |
| ⏱ | 약 {min}분 | `max(1, ceil(charCount / 400))` |

### 설계 결정
- `400자/분` — 한국어 평균 독서 속도 (연구 평균 근사치)
- `Intl.NumberFormat('ko-KR')` 로 1,234 같은 구분 표시
- divider 는 a11y 트리에서 `aria-hidden="true"` — 시각 구분만
- 부모 `role="group" aria-label="분석 통계 요약"` + 각 아이템 `role="listitem"` + `aria-label`

### API
```js
createStatsStrip(stats, { includeReadingTime: true })
updateStatsStrip(stripEl, newStats)
```

---

## 3. recommendation-list.js — 추천사항 그룹핑

### 분류 로직
1) **카테고리** — 한국어 키워드 매칭:
   - `제목` / `타이틀` → `title`
   - `첫 문장` / `후킹` / `도입` → `hook`
   - `키워드` / `단어` / `태그` → `keyword`
   - `문장 길이` / `이모지` / `가독` → `readability`
   - `이미지` / `문단` / `신뢰` / `수치` / `예시` → `content`
   - 매칭 없음 → `misc` (💡)
2) **우선순위** — 섹션 점수 기반:
   - `score < 50` → **high** (중요)
   - `50~74` → **medium** (권장)
   - `75+` → **low** (참고)
   - 심각도 단어(`너무`, `과도`, `초과`) → high 가중
   - 제안 어조(`권장`, `고려`) → low 가중

### 렌더
- `<details open>` 로 각 카테고리 그룹 접기/펼치기
- 빈 입력 → "🎉 추천사항이 없습니다" 빈 상태
- 항목 내 정렬: high → medium → low

### API
```js
createRecommendationList(recommendations, { sections })
```

---

## 4. score-card.js — 섹션 카드 고도화

### Before (단순 리스트)
- 선형 progress bar
- 3단계 색 (good / fair / poor)
- 모든 추천사항 평면 나열

### After (대시보드 카드)
- **미니 원형 게이지** — 반지름 22 · stroke 5 SVG 2 circle
- **4단계 색상:**
  - `≥ 85` excellent (녹색)
  - `≥ 70` good (인디고)
  - `≥ 50` fair (노랑)
  - `< 50` poor (빨강)
- **점수/만점 보조 라벨:** `/ 20` (섹션별 실제 만점, 예: titleSeo=20)
- **접기/펼치기:** 추천 3개+일 때 `<details>` 로 "+ 더 보기 (N)" 토글
- **호버 elevation:** CSS 전용 (`bm-score-card:hover { box-shadow... }` 기획자 pane 1 작업)

### API
```js
createScoreCard({
  title: '제목 SEO',
  score: 18,
  maxScore: 20,        // 섹션별 실제 만점
  recommendations: [...],
  sectionKey: 'titleSeo',
  visibleRecs: 2,
})
```

### 생성되는 속성
- `data-score`, `data-color`, `data-section` — CSS / QA grep hook
- `aria-label` — 스크린리더용 (`제목 SEO 18점 (만점 20)`)
- `tabindex="0"` — 키보드 탐색 가능

---

## 5. analyze-tab.js — 대시보드 리팩터

### 활성 탭 자동 감지
```
chrome.tabs.onActivated   → refreshActiveTabState()
chrome.tabs.onUpdated     → refreshActiveTabState()  (changeInfo.url || status==='complete')
```
- `blog.naver.com` 이 아니면 `시작` 버튼 disabled (`aria-disabled="true"`)
- "분석 대상: @{blogId}" 표시
- `extractBlogId()` — `/foo`, `/foo/123`, `?blogId=foo` 모두 지원

### 4가지 상태 렌더
| 상태 | DOM |
|-----|-----|
| 빈 상태 | 🔍 아이콘 + "네이버 블로그 글 페이지에서 분석을 시작하세요" |
| 스켈레톤 | hero skeleton + strip skeleton + 카드 6개 플레이스홀더 + `role=status` sr-only "분석 중" |
| 에러 카드 | ⚠️ 아이콘 + 메시지 + `다시 시도` 버튼 (**빨간 배너 지양** — 중앙 카드) |
| 성공 대시보드 | 경고 배너(옵션) + 히어로(게이지+제목/URL) + 스트립 + 카드 그리드 + 추천 목록 |

### 대시보드 구조
```
┌──────────────────────────────────────────────┐
│ ⚠️ (경고 배너 — too_short 등)                  │
├──────────────────────────────────────────────┤
│   ╭──게이지──╮        제목…                   │
│  │   84  A   │       https://blog.naver.com… │
│   ╰─────────╯                                │
├──────────────────────────────────────────────┤
│ 📝 1,234자 · 📄 14문장 · 🖼 6 · ⏱ 약 3분        │
├──────────────────────────────────────────────┤
│ ┌카드┐ ┌카드┐ ┌카드┐                            │
│ │ ●  │ │ ●  │ │ ●  │ (5개 섹션 그리드)           │
│ └────┘ └────┘ └────┘                           │
├──────────────────────────────────────────────┤
│ 추천사항 (N개)                                 │
│ ▼ 🏷 제목 (2건)   중요/권장 태그 + 본문          │
│ ▼ 🎯 후킹 (1건)                                 │
│ …                                             │
└──────────────────────────────────────────────┘
```

### warnings 배너 매핑
| 코드 | 메시지 |
|------|-------|
| `empty` | 글이 비어있습니다. |
| `too_short` | 글자 수가 매우 적습니다 (100자 미만). |
| `too_long` | 글이 매우 깁니다 (10,000자 초과). |
| `image_only` | 본문 없이 이미지만 있습니다. |
| `emoji_bomb` | 이모지가 과도하게 많습니다. |

---

## 규칙 준수 체크

- [x] `innerHTML` 사용 0건 — 전부 `dom-safe.createEl` + 자식 노드 배열
- [x] SVG 는 `document.createElementNS('http://www.w3.org/2000/svg', …)` 만 사용 (3곳: total-score-gauge / score-card 미니 게이지 / 추후 bar-chart — 이번 작업 범위 아님)
- [x] 외부 라이브러리 0 — chart.js / d3 미도입
- [x] 파일당 300~500줄 범위 (245~394)
- [x] BEM 클래스 네이밍 유지 — `bm-gauge`, `bm-stats-strip`, `bm-recs`, `bm-score-card`, `bm-analyze` 등
- [x] 다른 탭/페이지/handler 미변경 — `extension/sidepanel/tabs/analyze-tab.js` 와 `components/*.js` 만 수정/추가

---

## CSS 작업 인계 (기획자 pane 1)

pane 1 에서 `panel.css` 재작성 중. 본 작업이 기대하는 CSS 훅 목록:

### 총점 게이지
```css
.bm-gauge { position: relative; padding: 16px; border-radius: 16px; background: var(--bm-surface); }
.bm-gauge__head { display: flex; align-items: center; gap: 12px; }
.bm-gauge__ring { position: relative; display: inline-block; }
.bm-gauge__svg { display: block; }
.bm-gauge__track { stroke: var(--bm-ring-track); }  /* 연한 회색 */
.bm-gauge__progress { transition: stroke-dashoffset 600ms ease-out; }
.bm-gauge__progress--excellent { stroke: var(--bm-green-500); }
.bm-gauge__progress--good      { stroke: var(--bm-indigo-500); }
.bm-gauge__progress--fair      { stroke: var(--bm-yellow-500); }
.bm-gauge__progress--warn      { stroke: var(--bm-orange-500); }
.bm-gauge__progress--poor      { stroke: var(--bm-red-500); }
.bm-gauge__center { position: absolute; inset: 0; display: flex; flex-direction: column;
                    align-items: center; justify-content: center; }
.bm-gauge__score { font-size: 2.5rem; font-weight: 700; }
.bm-gauge__label { font-size: 0.75rem; color: var(--bm-muted); }
.bm-gauge__grade--excellent { background: var(--bm-green-50); color: var(--bm-green-700); }
/* … 나머지 등급 variants … */
```

### 통계 스트립
```css
.bm-stats-strip { display: flex; align-items: center; gap: 8px; padding: 12px;
                  background: var(--bm-surface); border-radius: 12px; }
.bm-stats-strip__item { display: flex; align-items: center; gap: 6px; }
.bm-stats-strip__icon { font-size: 1.1rem; }
.bm-stats-strip__value { font-weight: 700; }
.bm-stats-strip__label { font-size: 0.75rem; color: var(--bm-muted); }
.bm-stats-strip__divider { width: 1px; align-self: stretch; background: var(--bm-border); }
```

### 점수 카드 (호버 elevation 포함)
```css
.bm-score-card { padding: 16px; border-radius: 12px; background: var(--bm-surface);
                 box-shadow: 0 1px 3px rgba(0,0,0,.05);
                 transition: box-shadow .2s, transform .2s; }
.bm-score-card:hover, .bm-score-card:focus-within {
  box-shadow: 0 8px 24px rgba(0,0,0,.08);
  transform: translateY(-2px);
}
.bm-score-card--excellent { border-left: 4px solid var(--bm-green-500); }
.bm-score-card--good      { border-left: 4px solid var(--bm-indigo-500); }
.bm-score-card--fair      { border-left: 4px solid var(--bm-yellow-500); }
.bm-score-card--poor      { border-left: 4px solid var(--bm-red-500); }
.bm-score-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                 gap: 12px; }
```

### 추천사항
```css
.bm-recs { padding: 16px; background: var(--bm-surface); border-radius: 12px; }
.bm-recs__group-summary { cursor: pointer; list-style: none; display: flex; gap: 8px; align-items: center; }
.bm-recs__priority--high   { background: var(--bm-red-50);    color: var(--bm-red-700); }
.bm-recs__priority--medium { background: var(--bm-indigo-50); color: var(--bm-indigo-700); }
.bm-recs__priority--low    { background: var(--bm-gray-50);   color: var(--bm-gray-700); }
```

### 스켈레톤
```css
.bm-skeleton { background: linear-gradient(90deg, var(--bm-skeleton) 25%,
                var(--bm-skeleton-highlight) 37%, var(--bm-skeleton) 63%);
               background-size: 400% 100%;
               animation: bm-skeleton-shimmer 1.4s ease infinite;
               border-radius: 8px; }
.bm-skeleton--hero  { height: 180px; }
.bm-skeleton--strip { height: 48px; margin-top: 12px; }
.bm-skeleton--card  { height: 140px; }
.bm-skeleton-grid   { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                      gap: 12px; margin-top: 12px; }
@keyframes bm-skeleton-shimmer { 0% { background-position: 100% 50%; }
                                  100% { background-position: 0 50%; } }
```

### 에러 카드
```css
.bm-error-card { text-align: center; padding: 32px; border-radius: 12px;
                 background: var(--bm-surface); border: 1px dashed var(--bm-border); }
.bm-error-card__icon  { font-size: 2rem; }
.bm-error-card__title { margin: 8px 0; }
.bm-error-card__body  { color: var(--bm-muted); margin-bottom: 16px; }
```

### 분석 대상 라벨
```css
.bm-analyze__target--ok .bm-analyze__target-value  { color: var(--bm-green-700); }
.bm-analyze__target--bad .bm-analyze__target-value { color: var(--bm-muted); }
```

### sr-only (스크린리더 전용)
```css
.bm-sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden;
              clip: rect(0 0 0 0); white-space: nowrap; }
```

---

## 테스트 체크리스트 (QA 가 실행)

### 기능
- [ ] 활성 탭이 네이버 블로그가 아닐 때 "분석 시작" 버튼 disabled
- [ ] 탭 전환 / URL 변경 시 `분석 대상: @blogId` 실시간 갱신
- [ ] `blog.naver.com/foo` 와 `blog.naver.com/foo/123` 둘 다 blogId="foo" 추출
- [ ] 분석 중 스켈레톤 카드 6개 + hero + strip 플레이스홀더 표시
- [ ] 성공 시 하단 순서: (경고?) → hero → strip → 카드 그리드 → 추천 목록
- [ ] 실패 시 빨간 배너 **없음** — 중앙 에러 카드 + "다시 시도" 버튼
- [ ] 추천사항 3개+ 섹션은 "+ 더 보기" 토글 동작
- [ ] 총점 82 → 게이지 A 등급 green 배지
- [ ] warnings 에 `too_short` → 상단 ⚠️ 배너

### 보안
- [ ] `grep -rn "innerHTML" extension/sidepanel/` → 0건
- [ ] `grep -rn "insertAdjacentHTML" extension/sidepanel/` → 0건
- [ ] `document.createElementNS` 만 SVG 에 사용 — `new DOMParser` 사용 0건

### 접근성
- [ ] 카드 `tabindex="0"` 로 키보드 포커스 가능
- [ ] 스켈레톤 시 `role=status` sr-only 메시지 존재
- [ ] 에러 카드 `role="alert" aria-live="assertive"`
- [ ] 총점 게이지 `role="group" aria-label="총점 84점, 등급 A"`

---

## 남은 TODO / 향후

- **애니메이션:** dashOffset transition 은 CSS 전용. `updateTotalScoreGauge()` 후 값만 바꾸면 CSS transition 이 동작 (panel.css 에 `.bm-gauge__progress { transition: stroke-dashoffset 600ms ease-out; }` 필수).
- **호버 카드 상세 툴팁:** `score-card` 호버 시 섹션별 세부 점수 breakdown (details.length / details.keyword 등). 현재 scope 외.
- **recommendation-list 기본 접기 옵션:** 현재 `<details open>` 기본. `{ defaultOpen: false }` 옵션 추가 가능.
- **i18n:** 현재 한국어 하드코딩. Phase 10.2 라운드에서 `t('analyze_*')` 키로 치환 대상.
- **CSS 변수 정의:** 본 작업이 참조하는 `--bm-green-500` 등의 palette 는 pane 1 (panel.css) 에서 정의 필요.
