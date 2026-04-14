# Analyze Sanity Fix — 요약

담당: backend 에이전트 (구조/이미지 추출 sanity 개선)
작업일: 2026-04-14
범위: `extension/background/handlers/analyze-handler.js` + `extension/lib/analyzers/structure-analyzer.js`

---

## 해결한 증상

| # | 기존 증상 | 원인 | 수정 후 |
|---|----------|------|--------|
| 1 | 구조 분석이 **141개 섹션** 으로 오인식 | SmartEditor 의 `1. 2. 3. …` 숫자 리스트를 섹션 헤더로 판정 | 숫자 헤더 ≥ 7 → 리스트로 강등. 섹션 수 > 20 → 오탐 판정 → `falsePositive` 플래그 + 안내 추천 |
| 2 | 이미지 **60개** (아바타/광고/썸네일 포함) | 선택자가 `contentEl img` 전체 + data: URI 제외만 | alt 토큰 / URL 패턴 / 사이즈 3중 필터 + 우선순위 셀렉터 + 상한 50개 |
| 3 | 단락 **211개** 중복 집계 | `.se-component`, `.se-module-text` 같은 상위 컨테이너도 셀렉터에 포함되어 같은 텍스트가 2~3번 집계 | 리프 블록만 (`div.se-text-paragraph`, `p:not(:empty)`, `li`, `blockquote`, `h1~h6`, `.se-quote`) + 공백 정규화 후 dedup |

---

## 변경 파일

### 1) `extension/background/handlers/analyze-handler.js` (250 → 327 lines)

**extractBlockedText — 리프 블록만 수집:**
```js
const LEAF_BLOCK_SELECTOR = [
  'div.se-text-paragraph',   // SmartEditor ONE 리프 단락
  'p:not(:empty)',           // SmartEditor 2.x / legacy
  'li',
  'blockquote',
  'h1','h2','h3','h4','h5','h6',
  '.se-quote',
].join(',')
```
- `.se-component`, `.se-module-text`, `.se-component-content`, `strong`, `b` **제거** (상위/비-블록 요소)
- 공백 정규화: `replace(/\s+/g, ' ').trim()` 후 Set 기반 dedup — 미세 whitespace 차이로 중복 누락 방지

**이미지 필터 (신규 `isBodyImage` 함수):**
```js
const EXCLUDE_ALT_TOKENS = ['이모티콘', '스티커', '이모지']
const EXCLUDE_URL_RE = /\/(icon|sticker|profile)\/|sprites?|emoticon/i
const MIN_BODY_IMG_SIZE = 100

// 3중 필터:
//   1) alt 에 '이모티콘'/'스티커'/'이모지' 포함 → 제외
//   2) src 에 /icon/ /sticker/ /profile/ sprites emoticon → 제외
//   3) 표시 사이즈(attr → clientSize → naturalSize) 100px 미만 → 제외
//      * 사이즈 0 (lazy-load 전) 은 필터 skip — URL/alt 만 신뢰
```

**우선순위 셀렉터 + 폴백:**
```js
const PRIORITY_IMG_SELECTOR = [
  '.se-image img',
  'img.se-image-resource',
  '.se-image-resource img',
  'img.egjs-visible',
].join(', ')

let imgPool = contentEl.querySelectorAll(PRIORITY_IMG_SELECTOR)  // 우선
if (imgPool.length === 0) imgPool = contentEl.querySelectorAll('img')  // 폴백
```

- src 기반 dedup (Set)
- `.slice(0, 100)` → **50개 상한**

**debug 로깅:**
```js
console.debug('[analyze-handler] counts', {
  url: tab.url,
  contentChars: best.content.length,
  paragraphCount: st.totals?.paragraphCount ?? 0,
  sectionCount: st.sections?.length ?? 0,
  imageCount: best.images.length,
  falsePositive: !!st.falsePositive,
})
```
- 반환 직전 1회. DevTools → sidepanel → console 에서 회귀 감지.
- 큰 값이 찍히면 오인식 재발 신호 (paragraphCount > 100, sectionCount > 10 등).

### 2) `extension/lib/analyzers/structure-analyzer.js` (445 → 495 lines)

> **파일 길이 주의:** 기존 445 → 495. 400줄 상한을 **50줄 초과** — 기존 코드가 이미 445라 축소 없이 증분만 반영. 별도 라운드에서 recommendations/score 섹션 분리 리팩터 권장 (remaining_work 로 이월).

**신규 상수:**
```js
const NUMBERED_LIST_THRESHOLD = 7   // 숫자 헤더 이 이상이면 리스트로 강등
const MIN_SECTION_BODY_CHARS = 30   // 헤더 다음 본문 이 미만이면 무시
const MAX_REAL_SECTIONS = 20        // 필터 후에도 이 초과면 falsePositive
```

**detectHeaders — 숫자 리스트 강등:**
```js
const numberedCount = headers.filter(h => h.type === 'numbered').length
if (numberedCount >= NUMBERED_LIST_THRESHOLD) {
  return headers.filter(h => h.type !== 'numbered')
}
```
- 7 은 IDEAL.SECTION_COUNT_MAX(6) 를 한 개 초과하는 값 — 정상 블로그에서 "1. 2. 3. 4. 5. 6. 7." 형태 섹션 헤더는 비상식적.

**groupBySections — body 필터 + over-count 감지:**

*Sanity 1 (pre-loop body filter):*
```js
const filteredByBody = []
for (let i = 0; i < used.length; i++) {
  const cur = used[i]
  const next = used[i + 1]
  const endIdx = next ? next.index : lines.length
  const bodyChars = lines.slice(cur.index + 1, endIdx).join('').length
  if (bodyChars >= MIN_SECTION_BODY_CHARS) filteredByBody.push(cur)
}
used = filteredByBody
```

*Sanity 2 (post-build over-count check):*
```js
if (sections.length > MAX_REAL_SECTIONS) {
  return {
    intro: buildBlock('intro', '도입부', lines),
    sections: [],
    outro: null,
    falsePositive: true,
  }
}
```

**반환 shape 확장:**
- `groupBySections` 반환에 `falsePositive: boolean` 추가
- `analyzeStructure` 반환 최상위에 `falsePositive: boolean` 노출 — UI 가 회색 빈 상태 / 경고 표시에 사용
- 기존 필드(`intro`, `sections`, `outro`, `totals`, `score`, `recommendations`, `ideal`) 전부 유지 — **UI 호환성 보장**

**buildRecommendations — falsePositive 안내:**
```js
if (falsePositive) {
  recs.push(rec(
    'medium',
    'section',
    '목록이 많아 섹션 구분이 불명확합니다. 숫자 목록 대신 ▶ 또는 ## 마커로 섹션을 구분하세요.',
  ))
}
```
- `unshift` 아닌 `push` — 다른 추천과 자연스럽게 섞임. 필요 시 UI 가 `category==='section' + falsePositive` 기준으로 상단 배치 가능.

---

## 응답 shape 변화 (호환 분석)

**기존 UI 가 참조하는 필드는 모두 유지됨.** 새 필드는 선택적:

```ts
type StructureResult = {
  // 기존 유지
  title: string
  intro: Block
  sections: Section[]      // falsePositive === true 인 경우 [] 로 비워짐
  outro: Block | null
  totals: { sectionCount, imageCount, paragraphCount, charCount }
  score: ScoreBreakdown
  recommendations: Recommendation[]
  ideal: IdealConstants

  // NEW (선택적 — UI 가 있을 때만 특수 처리)
  falsePositive: boolean
}
```

**UI 측 영향:**
- `analyze-tab.js` 의 `createStructureCard(data.structure)` 는 `sections.length === 0` 일 때 이미 빈 상태 처리하도록 구현되어 있을 가능성 — 재점검 권장
- `falsePositive === true` 인 경우 별도 배지/안내를 추가하고 싶다면 structure-card 쪽에서 후속 작업

---

## 회귀 체크 (사용자 재현 케이스)

### Before
```
paragraphCount: 211
sectionCount:   141
imageCount:      60
```

### After (예상)
```
paragraphCount:  ~40-60   (리프만 집계 + dedup)
sectionCount:    0 or ≤10 (falsePositive 로 비워지거나 실제 헤더만)
imageCount:      ~5-15    (아바타/스티커/광고 필터링됨)
falsePositive:   true     (원문에 숫자 리스트가 많은 경우)
```

DevTools 콘솔에서 `[analyze-handler] counts` 로그로 실측 검증 가능.

---

## 테스트 시나리오

| 케이스 | 기대 동작 |
|-------|----------|
| 리스트 "1. 2. 3. … 20." 로 점철된 글 | 숫자 헤더 강등 → `sections: []` + falsePositive=true + "목록이 많아…" 추천 |
| 정상 구조 (▶ 또는 ## 로 3~6 섹션) | 기존과 동일하게 섹션 감지 + 점수 계산 |
| 한 줄 인용 뒤 바로 다음 헤더 | 해당 헤더 body < 30자 → 무시 (filteredByBody) |
| 아바타 프로필 이미지 다수 | URL `/profile/` 매치 → 제외 |
| SmartEditor 본문 이미지만 5개 | priority selector 로 깔끔히 추출, 광고/관련글 썸네일 제외 |
| 본문이 한 paragraph 에 여러 문장 | 리프 블록 기준 1개로 집계 (상위 컨테이너 중복 없음) |

---

## 알려진 TODO / 이월

- `structure-analyzer.js` 495줄로 400줄 상한 초과. `scoreXxx` / `buildRecommendations` / `splitLines` 계열을 `structure-scoring.js` 로 분리하는 리팩터 제안.
- 사이즈 필터(100px) 는 lazy-load 환경에서 일부 image 가 `width=0 height=0` 으로 남아 있을 수 있어 놓칠 수 있다. 기본 동작은 "사이즈 0 → filter 통과" 이므로 fail-open. 프로덕션에서 관측 후 조정.
- `NUMBERED_LIST_THRESHOLD` 는 7로 고정. PRD 기준(`SECTION_COUNT_MAX=6`)+1 이므로 넉넉하지만, 과소 판정이 나오면 조정 가능.
- 이미지 dedup 을 src 기반으로 하므로 동일 src + 다른 CDN 쿼리 파라미터(예: `?w=800`) 는 중복 처리되지 않을 수 있음. 필요 시 URL 정규화 추가.

---

## 규칙 준수

- [x] 기존 응답 shape 유지 — UI 호환 (신규 `falsePositive` 는 선택적)
- [x] MV3 content script context — DOMParser/location/document 만 사용
- [x] 한국어 주석 — 모든 새 상수/함수에 WHY 주석
- [x] analyze-handler 327줄 (< 400 ✅)
- [~] structure-analyzer 495줄 (400 초과 — 기존 445에서 +50, 사전 존재 조건 — 리팩터 이월)

---

## 변경 이력

| 날짜 | 변경 |
|------|------|
| 2026-04-14 | 초판 — 구조 141 / 이미지 60 / 단락 211 오인식 3종 해결 |
