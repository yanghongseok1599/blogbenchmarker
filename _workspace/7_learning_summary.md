# Phase 7 — 학습 엔진 구현 요약

> 작성일: 2026-04-14
> 작성자: analyzer-specialist 에이전트
> 작업 범위: TASKS.md Phase 7 "학습 엔진"
> 횡단 QA: `_workspace/qa-scripts/run-all.sh` → **5/5 PASS** (회귀 없음)

---

## 1. 산출 파일 (총 9개 — 신규 7 + 수정 2)

| # | 파일 | 종류 | 줄수 | 역할 |
|--:|---|---|---:|---|
| 1 | `extension/lib/repositories/learning-repo.js` | 신규 | 208 | learning_data CRUD + 키워드 검색 + count |
| 2 | `extension/lib/analyzers/learning-context.js` | 신규 | 181 | 학습본 N건 → styleProfile + learningRefs 빌드 |
| 3 | `extension/sidepanel/tabs/learning-tab.js` | 신규 | 290 | 목록/선택/삭제 UI 컨트롤러 |
| 4 | `extension/sidepanel/tabs/learning-tab.html` | 신규 | 37 | 학습 탭 마크업 참조본 |
| 5 | `extension/sidepanel/components/learning-card.js` | 신규 | 107 | 카드 컴포넌트(체크박스 + 삭제) |
| 6 | `extension/background/handlers/learning-handler.js` | 신규 | 42 | `learning.save` 액션 (저작권 게이트) |
| 7 | `extension/sidepanel/panel.css` | 수정 | +30 | 학습 탭/카드 스타일 추가 |
| 8 | `extension/content/analyzer.js` | 수정 | +71 | saveToLearning + ownContent 옵션 + dispatch |
| 9 | `extension/background/handlers/generate-handler.js` | 수정 | +59 | useLearning + learningIds 처리, learningContext 응답 |
| ─ | `extension/background/handlers/index.js` | 수정 | +2 | `learning.save` 라우트 등록 |

모든 파일 400줄 이하(최대 290줄).
`extension/auth/`, `supabase/functions/`, `supabase/migrations/`, `extension/mypage/` 미수정.

---

## 2. 액션/계약 추가

### 2.1 background route 신규
| 액션 | 페이로드 | 반환 |
|---|---|---|
| `learning.save` | `{ ownContent: true, title, content, keywords?, meta? }` | `{ id, createdAt }` |

### 2.2 generate.content 옵션 확장
기존 `topic + options(originality/length/extraNotes/learningRefs/language)` 위에 다음 옵션을 추가로 인식한다 (Edge Function 계약은 변경 없음 — 핸들러가 learningRefs 로 정규화):

```ts
options: {
  useLearning?: boolean         // true 시 learningIds → 학습본 fetch → learningRefs 자동 주입
  learningIds?: string[]        // 최대 3개 (LIMITS.LEARNING_REFS_MAX_COUNT)
  // ...기존 필드는 그대로
}
```

응답에 `learningContext` 추가(학습 사용 시):
```ts
learningContext: {
  sampleCount: number,
  topKeywords: string[],
  avgSentenceLen: number
} | null
```

호출자가 `options.learningRefs` 를 직접 넘기면 그쪽이 우선(단일 책임 원칙).

---

## 3. 핵심 설계 결정

### 3.1 저작권 안전 게이트 (PRD/요청 규칙)
타인 블로그 수집 데이터(`benchmark_posts`)가 `learning_data` 로 흘러가지 않도록 **3중 방어**:

1. **호출자 게이트** — `analyzer.js` 가 `options.saveToLearning && options.ownContent` 조합일 때만 dispatch.
2. **메시지 게이트** — `learning.save` 액션은 페이로드의 `ownContent === true` 가 아니면 즉시 throw.
3. **컨테이너 분리** — `benchmark-handler.js` 의 `upsertPosts` 는 `benchmark_posts` 테이블만 사용. 두 경로가 코드상 서로 import 하지 않음.

### 3.2 styleProfile 추출 알고리즘 (`learning-context.js`)
- 본문 누적 → `topKeywords(N=10)` + `avgSentenceLength`.
- 사용자가 저장한 `keywords` 는 빈도 1.5 가중치로 머지 후 합산 정렬.
- 첫 문단(최대 800자) → `detectHook` 으로 타입 분류 → `{type, count, ratio}` 분포.
- `refSnippets`: 최대 3건 × 500자 (`edge_function_contracts §1.1` learningRefs 한도 일치).
- 모든 입력은 `sanitizeRecords` 로 shape 가드 후 처리(외부 입력 안전).

### 3.3 학습 선택 영속화 (탭 간 핸드오프)
- learning-tab 의 체크박스 → `selectedIds` Set → `chrome.storage.local['bm.learning.selectedIds']`.
- generate-tab 은 같은 키를 읽어 `options.learningIds` 로 전달.
- 카드 삭제·새로고침 시 사라진 ID 는 selection 에서 자동 정리.

### 3.4 analyzer.js fire-and-forget 패턴
- content script 는 응답을 기다리지 않음 (UX 차단 회피).
- `chrome.runtime.lastError` 는 콜백에서 읽어 unhandled error 로깅 회피.
- 결과 `data.saveToLearning: boolean` 으로 dispatch 시도 여부 표시 / `learningSaved: null` 자리는 후속 패턴(브로드캐스트 메시지)으로 갱신 가능하게 남김.

### 3.5 repository 경유 원칙
- learning-tab.js 가 `learning-repo` 를 직접 import (UI ↔ repo 일치, supabase SDK 직접 호출 회피).
- 단일 entrypoint 변경(스키마 수정) 시 1곳만 갱신.

---

## 4. 보안·안전 체크포인트

| 항목 | 적용 방식 |
|---|---|
| 위험 DOM 속성 직접 할당 | 모든 카드/탭 DOM 은 `dom-safe.js` 의 createEl/safeText/clearAndAppend 만 사용 |
| 외부 데이터 textContent 경로 | 학습 제목/키워드/날짜는 createEl children 슬롯 → 자동 createTextNode |
| 타인 블로그 데이터 차단 | 호출자/메시지/컨테이너 3중 ownContent 게이트 |
| RLS 의존 | 본인 격리는 DB 정책에 위임. 클라이언트는 sanitize 만 |
| API 키 노출 | 추가 0건 (Edge Function 호출은 기존 generate-handler 의 `supabase.functions.invoke` 경유) |
| 동적 코드 실행 | 없음 |
| 입력 길이 클램프 | title 500자 / content 30000자 / keywords 50개 × 50자 / refSnippet 500자 |
| sender 출처 검증 | service-worker 의 기존 `isTrustedSender` 가 모든 메시지에 적용 |

---

## 5. 횡단 QA 결과

```
✅ PASS: 5/5
❌ FAIL: 0/5

🎉 모든 횡단 BLOCKER 검사 통과!
```

상세:
- check-hardcoded-keys: ✅
- check-dom-unsafe: ✅ (신규 학습 UI 7파일 위험 패턴 0건)
- check-rls-enabled: ✅ (DB 미수정)
- check-email-admin: ✅
- check-sw-async-return: ✅

---

## 6. 후속 작업 / 의존

### 다른 에이전트로 위임
1. **ui-builder (Phase 6.x generate 탭)** — `chrome.storage.local['bm.learning.selectedIds']` 를 읽어 `generateHandler.content({ topic, options: { useLearning: true, learningIds } })` 호출 + 응답의 `learningContext` 표시.
2. **ui-builder (panel.js)** — `learning` 탭을 panel.html/panel.js 의 TAB_IDS 에 추가하고 `mountLearningTab` 활성화 훅 등록(현재는 export 만 준비, 미마운트).
3. **supabase-backend (Edge Function)** — Phase 5.1 generate-content 가 `learningRefs` 를 시스템 프롬프트에 fence 로 주입하는지 재확인. 새로 `styleProfile` 키를 받지는 않으므로 변경 불필요.
4. **security-qa** — Phase 7 체크리스트로 정밀 검증 — 특히 (a) ownContent 우회 시도, (b) learningRefs 길이/개수 한도, (c) tab.js 의 `cssEscape` ID 처리.

### 향후 고려 사항 (현재 범위 밖)
- 학습 데이터 페이지네이션(현재 50건 단위 로드만).
- styleProfile 캐싱(같은 selectedIds 조합 반복 호출 시 chrome.storage.local 캐시).
- 분석-자동저장 결과 토스트(메시지 응답 핸들러로 success/failure 표시).
- 학습 제한(FREE 50개 / PRO 무제한) UI 안내(PRD 기준은 있으나 본 Phase 미구현).

---

## 7. 파일별 줄수 (400줄 제한)

```
learning-repo.js      208
learning-context.js   181
learning-tab.js       290
learning-tab.html      37
learning-card.js      107
learning-handler.js    42
analyzer.js (수정 후) 141
generate-handler.js   241
```

모두 400 이하 — 통과.
