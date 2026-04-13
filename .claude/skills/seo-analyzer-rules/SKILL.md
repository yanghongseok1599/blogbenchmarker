---
name: seo-analyzer-rules
description: 네이버 블로그 SEO 분석 엔진 작성·수정 시 반드시 사용. "SEO 분석", "점수 계산", "hook-detector", "후킹 감지", "FIRE 공식", "nlp-utils", "형태소", "문장 분석", "첫 문장 유형", "어조 분석", "이모지 통계", "seo-analyzer"가 언급되면 로드한다. 후속 트리거: "분석 개선", "점수 보정", "hook false positive", "분석 정확도". 점수 체계·정규식 패턴·경계 케이스 처리의 표준을 제공한다.
---

# SEO Analyzer Rules

## 이 스킬이 전달하는 것

`analyzer-specialist` 에이전트가 `extension/lib/analyzers/` 아래 모듈을 만들 때의 **결정적 점수 체계와 hook-detector 개선 규칙**. 기존 `blog-booster-pro/content/analyzer.js:469-489`의 false positive 문제를 해결하는 정규식+문맥 규칙이 핵심.

## 1. 점수 체계 (100점 만점)

### 1-1. 구성
| 항목 | 만점 | 측정 대상 |
|---|---|---|
| 첫 문단 품질 | 15 | 첫 200자 내 후킹·정보 밀도 |
| 콘텐츠 구조 | 15 | 단락 수, 소제목, 리스트 사용 |
| FIRE 공식 | 15 | First·Interest·Reason·Example 4요소 |
| 제목 최적화 | 15 | 길이, 키워드, 숫자·특수문자 |
| 이미지 | 15 | 개수, 간격, alt 사용 |
| 신뢰성 | 15 | 출처 언급, 수치, 개인 경험 |
| 태그 | 10 | 개수(5~10 적정), 중복 |
| **합계** | **100** | |

### 1-2. 결정적 계산 원칙
- 같은 입력 → 같은 점수 (무작위 금지)
- 외부 API 호출 금지 (오프라인 NLP만)
- 시간·환경 변수 영향 금지
- 테스트 가능: 순수 함수로 작성, DOM·chrome API 의존 금지

### 1-3. breakdown 필수 노출
UI에서 항목별 점수를 표시할 수 있도록 모든 세부 점수를 반환.

## 2. 분석 결과 JSON shape (고정)

```json
{
  "seoScore": 78,
  "breakdown": {
    "firstParagraph": 12,
    "structure": 13,
    "fire": 11,
    "title": 14,
    "images": 8,
    "trust": 10,
    "tags": 10
  },
  "stats": {
    "charCount": 1850,
    "paragraphCount": 12,
    "sentenceCount": 45,
    "imageCount": 5,
    "wordCount": 420,
    "avgSentenceLength": 41.1
  },
  "hookDetection": {
    "type": "question",
    "confidence": 0.92,
    "matchedPattern": "question-mark-end",
    "firstSentence": "여러분은 이 사실을 알고 계셨나요?",
    "reasons": ["물음표로 종결", "40자 이내", "2인칭 대명사 포함"]
  },
  "sentenceDistribution": {
    "declarative": 0.70,
    "question": 0.20,
    "exclamation": 0.10
  },
  "emojiStats": {
    "count": 15,
    "density": 0.008,
    "penalty": 0
  },
  "topKeywords": [
    { "word": "블로그", "count": 23 },
    { "word": "SEO", "count": 18 }
  ],
  "warnings": []
}
```

**`warnings` 배열**에 경계 케이스 플래그를 담는다: `"too_short"`, `"image_only"`, `"emoji_bomb"` 등.

## 3. Hook Detection 개선 규칙

### 3-1. 기존 버그 (재현 금지)
`blog-booster-pro/content/analyzer.js:469-489`는 단순 키워드 매칭:
- "안녕"만 있으면 인사형
- "?"만 있으면 질문형
- 이로 인해 "안녕하세요? 오늘은…" 같은 흔한 도입부를 "질문형"으로 오판

### 3-2. 개선 원칙
- **정규식 + 문맥 규칙** 조합
- 첫 "문장"을 먼저 분리 (마침표/물음표/느낌표 기준)
- 각 타입별 **최소 2개 이상의 조건**을 충족해야 판정
- `confidence` (0~1)를 계산해 애매한 경우 `"unknown"` 반환

### 3-3. 타입별 판정 규칙

**질문형 (question)**
- 조건: 문장 종결이 `?` AND 문장 길이 ≤ 40자 AND (의문사 `누가|무엇|어디|언제|왜|어떻게|얼마` 포함 OR 2인칭 대명사 `여러분|당신|너` 포함)
- confidence: 조건 충족 개수 / 3

```js
const QUESTION_ENDING = /\?\s*$/
const INTERROGATIVE = /(누가|무엇|어디|언제|왜|어떻게|얼마)/
const SECOND_PERSON = /(여러분|당신|너희|너)/

function detectQuestion(firstSentence) {
  const reasons = []
  let score = 0
  if (QUESTION_ENDING.test(firstSentence)) { score++; reasons.push('물음표 종결') }
  if (firstSentence.length <= 40) { score++; reasons.push('40자 이내') }
  if (INTERROGATIVE.test(firstSentence) || SECOND_PERSON.test(firstSentence)) {
    score++; reasons.push('의문사/2인칭')
  }
  return { match: score >= 2, confidence: score / 3, reasons }
}
```

**감탄형 (exclamation)**
- 조건: 종결이 `!` 또는 `!!` AND 감탄 부사(`정말|너무|엄청|진짜|완전`) 포함
- 둘 다 충족 시 match

**통계형 (statistic)**
- 조건: `\d+(\.\d+)?%` OR `\d+배` OR `\d+명` OR `\d+년` OR `\d+원` 패턴 포함 AND 문장 내 명사·조사가 있음(숫자만 나열 아님)

**스토리텔링 (storytelling)**
- 조건: 과거시제 어미(`~었다|~였다|~했다|~왔다`) 포함 AND (1인칭 `저는|나는|제가` OR 시간 표지 `어느 날|그때|처음`)
- 단문이면 match 안 됨 — 첫 문단 최소 2문장 필요

**인사형 (greeting)**
- 조건: 명시적 인사말(`안녕하세요|반갑습니다|반가워요|안녕`) AND 문장 길이 ≤ 20자 AND 뒤 문장이 자기소개/톤 전환
- 단독일 때만 match. "안녕하세요? 오늘은…"은 질문형 아님 + 인사형 아님 (confidence 낮음)

**unknown (판정 불가)**
- 어느 타입도 2개 조건 충족 못함 → `{ type: "unknown", confidence: 0 }`

### 3-4. confidence 임계값
- ≥ 0.8: 확실 — UI에 타입 표시
- 0.5 ~ 0.79: 애매 — "가능성: X형"으로 표시
- < 0.5: unknown으로 대체

## 4. 형태소 분석 경량 구현

완전한 형태소 분석기(Khaiii·Mecab) 내장은 과함. 다음으로 충분:

### 4-1. 조사 제거
```js
const JOSA = /(을|를|이|가|은|는|에서|에게|에|의|와|과|로|으로|도|만|까지|부터|처럼|같이|보다|마다|조차|라도|나마|이나|나|든지|든|라는)$/
function stripJosa(word) { return word.replace(JOSA, '') }
```

### 4-2. 불용어
```js
const STOPWORDS = new Set([
  '이', '그', '저', '것', '들', '수', '및', '등', '또', '더', '좀',
  '거', '게', '걸', '뭐', '왜', '어', '음', '아', '그리고', '하지만', '그런데',
  '정말', '진짜', '너무', '아주', '매우', '또한'
])
```

### 4-3. 단어 빈도
```js
function topKeywords(text, n = 10) {
  const words = text
    .split(/\s+/)
    .map(stripJosa)
    .filter(w => w.length >= 2 && !STOPWORDS.has(w) && !/^\d+$/.test(w))

  const freq = new Map()
  for (const w of words) freq.set(w, (freq.get(w) ?? 0) + 1)

  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([word, count]) => ({ word, count }))
}
```

## 5. 경계 케이스 처리

### 5-1. 빈 글
모든 breakdown 0, `warnings: ["empty"]`. 크래시 대신 유효한 shape 반환.

### 5-2. 매우 짧은 글 (100자 미만)
- `warnings: ["too_short"]`
- charCount·paragraphCount 비례 감점
- hook-detector는 정상 작동 (첫 문장 존재 시)

### 5-3. 이미지만 있는 글
- `warnings: ["image_only"]`
- breakdown: images·structure만 점수, 나머지 0

### 5-4. 이모지 폭탄 (density > 0.05)
- `emojiStats.penalty`에 감점 (최대 -10점)
- `warnings: ["emoji_bomb"]`

### 5-5. 초장문 글 (10000자 이상)
- 성능: 정규식은 문단 단위로 분할 후 병렬(Promise.all)
- hook-detector는 첫 문단만 대상 — 긴 본문 스캔 금지

## 6. 정규식 성능 (ReDoS 방지)

### 6-1. 금지 패턴
```js
// 중첩 수량자 — 카타스트로픽 백트래킹
/(a+)+/
/(a|b)*c/
/(\w+)+/
```

### 6-2. 안전 패턴
```js
// 명시적 앵커
/^\s*\d+(\.\d+)?%\s*$/

// 수량자 상한
/\w{1,100}/
```

### 6-3. 최악 입력 테스트
모든 정규식은 다음으로 테스트:
- 10000자 공백
- 10000자 같은 문자 반복
- 10000자 랜덤 유니코드

각 케이스 100ms 이내 완료해야 함.

## 7. FIRE 공식 구현

### 7-1. 각 요소 0~3.75점

**F (First impression)**: 첫 문단 후킹 성공 시 만점
- hook-detector `confidence ≥ 0.8` → 3.75
- `0.5 ~ 0.79` → 2.5
- 미만 → 1.0 (존재하지만 약함) 또는 0 (unknown)

**I (Interest)**: 흥미 유발 요소
- 통계·사례·질문·스토리 중 2개 이상 포함 → 3.75
- 1개 → 2.0
- 0개 → 0

**R (Reason)**: 논리·근거
- 수치(`\d+%|\d+배`) 또는 인용 마크(`"..."`, `'...'`) 또는 출처(`~에 따르면|~의 통계`) 존재 → 3.75
- 개수 기반 점수

**E (Example)**: 구체 사례
- 이미지 ≥ 3 AND 본문에 "예를 들어|가령|실제로" 등 표지 → 3.75
- 이미지만 3개 → 2.0
- 언어 표지만 있음 → 1.0

### 7-2. 합산
`fire = F + I + R + E` (최대 15점)

## 8. 흔한 실수 체크리스트

- [ ] 결과 shape이 위 JSON 예시와 다름 → UI 깨짐
- [ ] 점수 합이 100 초과 → breakdown 검산
- [ ] 빈 입력에서 크래시 → 경계 케이스 테스트 누락
- [ ] hook-detector false positive → 조건 2개 이상 충족 규칙 누락
- [ ] 정규식 ReDoS → 중첩 수량자 사용
- [ ] `chrome.*` API·`document.*` 사용 → 순수 함수 원칙 위반

## 9. 참고 스킬

- 기존 로직 참고 (재사용/재작성 판별): `legacy-port-guide`
- UI 연결: ui-builder가 이 shape을 렌더
- 성능·ReDoS 검증: `boundary-qa`에 검사 요청
