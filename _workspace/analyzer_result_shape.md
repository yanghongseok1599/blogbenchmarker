# Analyzer Result Shape — Phase 3.1

> SEO 분석 엔진(`extension/lib/analyzers/seo-analyzer.js`)의 **공개 JSON 계약서**.
> UI 렌더(`ui-builder`), 학습 데이터 저장(`learning-repo`), AI 생성 컨텍스트 주입(`generate-content`)에서 이 shape 를 사용한다.
> 변경 시 이 문서를 먼저 갱신한 뒤 코드를 수정한다.

작성일: 2026-04-14
관련 파일:
- `extension/lib/analyzers/seo-analyzer.js` — `analyze()` 의 반환값
- `extension/content/analyzer.js` — `runAnalysis()` 의 `data` 필드

---

## 1. 입력 shape (`analyze(input)`)

```ts
type AnalyzeInput = {
  title:   string                       // 블로그 제목
  content: string                       // 본문 텍스트 (\n\n 이 단락 구분자)
  meta?: {
    keyword?: string                    // 타깃 키워드(사용자 지정) — 있으면 제목 매칭 엄격
    primaryKeyword?: string             // keyword 별칭
    tags?: string[]
    ogTitle?: string
    ogDescription?: string
    ogUrl?: string
    url?: string
  }
  images?: Array<{ src: string; alt?: string; width?: number; height?: number }>
}
```

---

## 2. 출력 shape (`analyze()` 반환값)

```ts
type AnalysisResult = {
  totalScore: number                    // 0~100 (정수)
  sections: {
    titleSeo:       Section             // 20점 만점
    contentSeo:     Section             // 30점 만점
    hookScore:      Section             // 15점 만점
    readability:    Section             // 20점 만점
    keywordDensity: Section             // 15점 만점
  }
  recommendations: string[]             // 최대 8개 — UI 리스트 그대로 노출 가능
  stats: Stats
  hookDetection: HookDetection
  warnings: WarningCode[]               // 경계 케이스 플래그
}

type Section = {
  score:    number                      // 0 ~ maxScore
  maxScore: number
  details:  Record<string, any>         // 섹션별로 다름 (§3 참조)
}

type Stats = {
  charCount:         number             // 공백 제외 글자 수
  paragraphCount:    number             // 빈 줄 기준 단락 수
  sentenceCount:     number
  imageCount:        number
  wordCount:         number             // 공백 분리 단어 수
  avgSentenceLength: number             // 소수 1자리
  emojiCount:        number
}

type HookDetection = {
  type:            'question' | 'exclamation' | 'statistic'
                 | 'storytelling' | 'greeting' | 'unknown'
  confidence:      number               // 0 ~ 1, 소수 2자리
  firstSentence:   string
  matchedPattern:  string | null        // 예: 'question-rule'
  reasons:         string[]             // 예: ['물음표 종결', '40자 이내']
}

type WarningCode =
  | 'empty'
  | 'too_short'     // charCount < 100
  | 'too_long'      // charCount > 10000
  | 'image_only'    // images > 0 AND charCount < 100
  | 'emoji_bomb'    // emoji density > 5%
```

### 2.1 점수 합산 불변량

- `totalScore === sections.titleSeo.score + sections.contentSeo.score + sections.hookScore.score + sections.readability.score + sections.keywordDensity.score`
- 각 `section.score ∈ [0, section.maxScore]`
- `maxScore` 합계 = 20 + 30 + 15 + 20 + 15 = **100**

---

## 3. 섹션별 `details` 구조

### 3.1 `titleSeo` (max 20)

```ts
{
  text: string
  length: number              // 0~8, 20~40자 이상적
  keyword: number             // 0~6, meta.keyword 포함 시 6
  hasNumberOrBracket: number  // 0~4, 숫자 / [] / () 가산
  penalty: number             // 0 또는 -2 (!!  ?? 남발 시)
}
```

### 3.2 `contentSeo` (max 30)

```ts
{
  paragraphs: number          // 0~8, 3~15 적정 + heading 보너스
  images:     number          // 0~8, 3~10 적정
  fire:       number          // 0~8, I+R+E (First 는 hookScore 에서)
  trust:      number          // 0~6, 수치 / URL·출처 / 1인칭
  hasHeading: boolean
}
```

### 3.3 `hookScore` (max 15)

```ts
{
  type:           HookDetection['type']
  confidence:     number
  firstSentence:  string
  matchedPattern: string | null
}
```

점수 규칙:
- `confidence ≥ 0.8` → 15
- `confidence ≥ 0.5` → 10
- `type === 'unknown'` AND `firstParagraph.length > 50` → 3
- 그 외 → 5 또는 0

### 3.4 `readability` (max 20)

```ts
{
  avgSentenceLength:    number
  sentenceDistribution: { declarative: number; question: number; exclamation: number }
  emojiCount:           number
  emojiDensity:         number    // 퍼센트 (소수 2자리)
  emojiPenalty:         number    // 0 또는 -4
}
```

### 3.5 `keywordDensity` (max 15)

```ts
{
  topKeywords:       Array<{ word: string; count: number }>  // 최대 10개
  titleMatchCount:   number                                   // 상위 5개 중 제목에 포함된 수
  topDensityPercent: number                                   // 최상위 키워드 밀도(%)
}
```

---

## 4. `runAnalysis()` (content script 진입점) 반환 shape

```ts
type RunAnalysisResult =
  | {
      ok: true
      data: AnalysisResult & {
        source: {
          url: string
          editorVersion: 'smarteditor-one' | 'legacy' | 'post-ct' | 'unknown'
          title: string
          imageCount: number
          elapsedMs: number
        }
      }
    }
  | {
      ok: false
      error: string                                    // 사용자 친화 메시지
      code:  'content_not_found' | 'analyzer_exception'
      data?: { editorVersion?: string; message?: string }
    }
```

---

## 5. 다른 에이전트용 계약(Contract)

### 5.1 ui-builder (사이드패널 분석 탭)
- `sections.*.score` / `sections.*.maxScore` 로 프로그레스 바 렌더.
- `sections.*.details` 는 UI 힌트로 사용 (선택적 — 고정 키 집합이 아니므로 optional 렌더).
- `recommendations` 는 그대로 `<ul>` 에 `textContent` 로 바인딩 (innerHTML 금지).
- `hookDetection.type === 'unknown'` 시 "감지 실패" 카드 표시.
- `warnings` 배열에 `'too_short'` 포함 시 경고 배너.

### 5.2 learning-repo (학습 데이터 저장)
- `content_json`:
  ```json
  {
    "title": "...",
    "content": "...",
    "seoScore": 78,
    "sections": { ... },
    "hookDetection": { ... },
    "stats": { ... }
  }
  ```
- `keywords` 컬럼(text[]): `sections.keywordDensity.details.topKeywords` 의 `word` 배열.
- `meta`: `warnings` / `recommendations` 저장.

### 5.3 generate-content (AI 글 생성)
- 학습 데이터를 프롬프트에 주입할 때 `sections.keywordDensity.details.topKeywords` 상위 5개와 `hookDetection.type` 을 참조.
- `recommendations` 는 프롬프트에 포함하지 않는다(사용자 맞춤 피드백일 뿐, 생성 품질에 혼선).

### 5.4 benchmark-repo (경쟁 블로그 캐시)
- `benchmark_posts.metrics` JSONB 키:
  ```json
  {
    "seoScore": 82,
    "charCount": 1850,
    "imageCount": 7,
    "avgSentenceLength": 41.1,
    "topKeywords": ["블로그", "SEO", "후기"],
    "hookType": "question"
  }
  ```
- 위 키는 본 shape 의 `totalScore`, `stats.*`, `sections.keywordDensity.details.topKeywords`, `hookDetection.type` 에서 파생.

---

## 6. 결정성 / 재현성 보장

- 같은 입력 → 같은 출력 (무작위 요소, 시간 의존, 외부 API 호출 없음).
- `chrome.*` / `document` / `fetch` / `Math.random()` 미사용.
- 테스트:
  ```js
  import { analyze } from 'extension/lib/analyzers/seo-analyzer.js'
  const a = analyze({ title: '테스트', content: '본문...', images: [] })
  const b = analyze({ title: '테스트', content: '본문...', images: [] })
  // JSON.stringify(a) === JSON.stringify(b)
  ```

---

## 7. 변경 이력

| 날짜 | 변경 | 사유 |
|------|-----|------|
| 2026-04-14 | 초판 — Phase 3.1 (5개 파일 신규 생성) | 분석 엔진 스펙 확정 |
