# Edge Function Contracts

> 모든 Supabase Edge Function 의 **요청/응답 shape 단일 소스**. 다른 에이전트(extension-core, ui-builder, security-qa)가 이 문서의 타입을 기준으로 코드를 작성한다.
> 변경 시 본 문서를 먼저 업데이트한 뒤 코드를 수정한다.

작성일: 2026-04-14
관리 대상: `supabase/functions/*/index.ts`

---

## 0. 공통 규칙

### 0.1 응답 봉투(Envelope)
**모든** Edge Function 은 다음 두 가지 shape 중 하나를 반환한다:

```ts
type OkResponse<T>     = { ok: true;  data: T }
type ErrorResponse     = { ok: false; error: { code: string; message: string; details?: unknown } }
```

HTTP status 와 `ok` 불린을 **둘 다** 체크 가능하게 한다.

### 0.2 공통 에러 코드
| code | HTTP | 발생 위치 | 의미 |
|------|------|----------|------|
| `method_not_allowed` | 405 | 라우터 | GET/PUT 등 허용되지 않는 메서드 |
| `invalid_content_type` | 415 | 라우터 | `application/json` 이 아님 |
| `invalid_input` | 400 | 파서 | 필드 누락 / 타입 불일치 / 길이 초과 |
| `missing_authorization` | 401 | auth | `Authorization` 헤더 없음 |
| `invalid_token` | 401 | auth | JWT 만료/위변조 |
| `profile_not_found` | 404 | auth | `auth.users` 는 있으나 `profiles` row 누락 (가입 직후 race) |
| `server_misconfig` | 500 | auth | SUPABASE_URL / ANON_KEY / GEMINI_API_KEY 미설정 |
| `rate_limit` | 429 | quota | 1분당 호출 한도 초과 |
| `quota_exceeded` | 429 | quota | 일일 사용 한도 초과 |
| `upstream_error` | 502 | 업스트림 | Gemini/외부 API 장애 |

### 0.3 인증 공통
- 요청 헤더: `Authorization: Bearer <supabase_jwt>` 필수
- 서버는 `anon_key + 클라이언트 JWT` 로 Supabase client 를 만든다 → RLS 자동 적용
- `service_role` 은 본 디렉토리 전반에서 사용 금지 (verify-subscription / admin-actions 만 별도 허용)

### 0.4 CORS
- `Access-Control-Allow-Origin`: `*` (기본) 또는 `chrome-extension://<ID>` (secret `ALLOWED_EXTENSION_IDS` 지정 시)
- `Access-Control-Allow-Headers`: `authorization, x-client-info, apikey, content-type`
- OPTIONS preflight 는 즉시 200 응답

---

## 1. `POST /functions/v1/generate-content`

**상태:** Phase 5.1 구현 완료 (2026-04-14)

### 1.1 Request

```ts
type GenerateContentRequest = {
  topic: string                                     // 1~500자, 필수
  options?: {
    originality?: 'preserve' | 'remix' | 'creative' // 기본: 'remix'
    length?: 'short' | 'normal' | 'long'            // 기본: 'normal' (짧게/표준/길게)
    extraNotes?: string                              // 추가 요청(최대 500자)
    learningRefs?: string[]                          // 학습 참고 글 발췌. 최대 3개, 각 500자
    language?: 'ko' | 'en' | 'ja'                    // 기본: profiles.language
  }
}
```

Headers:
- `Authorization: Bearer <supabase_jwt>` (필수)
- `Content-Type: application/json` (필수)

### 1.2 Response — 성공

```ts
type GenerateContentSuccess = {
  ok: true
  data: {
    content: string            // 생성된 블로그 본문 (제목 제외)
    tokensUsed: number         // Gemini usageMetadata.totalTokenCount
    model: 'gemini-2.5-flash'
    finishReason: string       // 'STOP' / 'MAX_TOKENS' / 'SAFETY' 등
    quota: {
      minuteCount: number      // 이번 호출 포함 최근 1분 count
      dailyCount: number       // 이번 호출 포함 최근 24시간 count
      dailyQuota: number | null // null = 무제한(pro 이상 / admin)
      minuteLimit: number      // 10
    }
  }
}
```

HTTP 200.

### 1.3 Response — 실패

| code | HTTP | 사용자 메시지 |
|------|------|--------------|
| `invalid_input` | 400 | "topic 은 비어있지 않은 문자열이어야 합니다." 등 구체적 메시지 |
| `missing_authorization` | 401 | "Authorization 헤더가 없습니다." |
| `invalid_token` | 401 | "인증 토큰이 유효하지 않습니다. 다시 로그인해 주세요." |
| `profile_not_found` | 404 | "프로필 정보를 찾지 못했습니다. 잠시 후 다시 시도해 주세요." |
| `rate_limit` | 429 | "너무 빠르게 요청하고 있습니다. 1분당 10회까지 가능합니다." |
| `quota_exceeded` | 429 | "일일 사용량(3회)을 초과했습니다. 플랜 업그레이드를 고려해 주세요." |
| `invalid_key` | 500 | "AI 기능 설정에 문제가 있습니다. 관리자에게 문의하세요." (내부: Gemini API 키 문제) |
| `missing_key` | 500 | "AI 기능이 현재 설정되어 있지 않습니다. 관리자에게 문의하세요." |
| `upstream_error` | 502 | "AI 서버에서 오류가 발생했습니다. 잠시 후 다시 시도해 주세요." |
| `invalid_response` | 502 | "AI 서버 응답을 해석할 수 없습니다." |

`rate_limit` / `quota_exceeded` 응답의 `error.details`:
```ts
{
  minuteCount: number
  dailyCount: number
  dailyQuota: number | null
  minuteLimit: number
}
```

### 1.4 쿼터 정책

| Plan | 1분 한도 | 1일 한도 |
|------|---------|---------|
| `free` | 10 | **3** (PRD 근거) |
| `pro` | 10 | 100 |
| `unlimited` | 10 | ∞ |
| `is_admin=true` (모든 plan) | ∞ | ∞ |

- 1분 한도는 plan 무관 DoS 방어
- 1일 기준은 "최근 24시간" rolling window (자정 리셋 아님)

### 1.5 부수 효과
- **성공 시**: `usage_logs` 에 1행 INSERT (`feature='generate_content'`, `cost_tokens = tokensUsed`)
- **업스트림 실패 시**: usage_logs INSERT **없음** (비용 미발생)
- **로그 실패**: 응답 변경 없이 `console.warn` — 본 응답 성공 보장

### 1.6 보안
- `GEMINI_API_KEY` 는 `Deno.env.get()` 에서만 읽음(하드코딩 0건)
- 프롬프트 주입 방어:
  - 시스템 프롬프트와 사용자 입력을 `<<<USER_TOPIC_START>>> / <<<USER_TOPIC_END>>>` fence 로 분리
  - 사용자 입력에서 fence 토큰 탐지 시 공백 치환(탈출 시도 무력화)
  - 시스템 프롬프트에 "메타 지시 무시" 규칙 명시
- 로그 내용: userId + 에러 코드 + HTTP 상태만. 프롬프트 원문·API 키·토큰값 직접 로깅 없음

### 1.7 extension-core / UI 참조 포인트

```ts
// background/handlers/generate-handler.js
const { data: { session } } = await supabase.auth.getSession()
const res = await fetch(`${SUPABASE_URL}/functions/v1/generate-content`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${session.access_token}`,
    'Content-Type':  'application/json'
  },
  body: JSON.stringify({ topic, options })
})
const payload = await res.json()
if (!payload.ok) {
  // payload.error.code 를 UI 문구 매핑에 사용
  return { ok: false, error: payload.error }
}
// payload.data.content → 클립보드/에디터로 전달
```

---

## 2. `POST /functions/v1/extract-youtube`

**상태:** Phase 6 구현 완료 (2026-04-14)

### 2.1 Request

```ts
type ExtractYoutubeRequest = {
  videoUrl: string                                  // 1~500자, 필수
  options?: {
    targetLanguage?: 'ko' | 'en' | 'ja'             // 기본: profiles.language (미지정 시 'ko')
    length?:         'short' | 'normal' | 'long'    // 기본: 'normal'
  }
}
```

Headers:
- `Authorization: Bearer <supabase_jwt>` (필수)
- `Content-Type: application/json` (필수)

지원 URL 포맷:
- `https://www.youtube.com/watch?v=<ID>`
- `https://youtu.be/<ID>`
- `https://www.youtube.com/shorts/<ID>`
- `https://www.youtube.com/embed/<ID>`
- `https://m.youtube.com/watch?v=<ID>`
- `https://music.youtube.com/watch?v=<ID>`

### 2.2 Response — 성공

```ts
type ExtractYoutubeSuccess = {
  ok: true
  data: {
    transcript: {
      videoId:         string
      language:        string                // 실제 선택된 자막 언어 ('ko','en','ko-KR' 등)
      isAutoGenerated: boolean               // true = auto caption (ASR)
      text:            string                // 전체 자막 단일 텍스트
      charCount:       number
    }
    blogPost: {
      title:        string                   // AI 생성 SEO 제목
      content:      string                   // AI 생성 본문 (빈 줄로 섹션 구분, `## 소제목` 허용)
      tokensUsed:   number
      model:        'gemini-2.5-flash'
      finishReason: string                   // 'STOP' 등
    }
    source: {
      videoId:     string
      title:       string | null             // YouTube 원본 제목
      author:      string | null             // 채널명
      durationSec: number | null
      url:         string                    // 정규화된 watch URL
    }
    quota: {
      minuteCount: number
      dailyCount:  number
      dailyQuota:  number | null
      minuteLimit: number
    }
  }
}
```

HTTP 200.

> 참고: 서버는 `transcript.segments[]` (시간 정보 포함) 를 내부적으로 사용하지만
> 응답 크기 감소를 위해 **최종 응답에는 포함하지 않는다**. 필요 시 별도 endpoint 로 분리.

### 2.3 Response — 실패

| code | HTTP | 사용자 메시지 |
|------|------|--------------|
| `invalid_input` | 400 | "videoUrl 은 비어있지 않은 문자열이어야 합니다." 등 |
| `invalid_url` | 400 | "지원하는 YouTube URL 형식이 아닙니다. ..." |
| `missing_authorization` | 401 | (공통) |
| `invalid_token` | 401 | (공통) |
| `profile_not_found` | 404 | (공통) |
| `video_unavailable` | 404 | "비공개/삭제된 영상이거나 접근이 제한된 콘텐츠입니다." |
| `no_transcripts` | 404 | "이 영상에는 자막이 없습니다. 다른 영상을 시도해 주세요." |
| `rate_limit` | 429 | "1분당 10회까지 가능합니다." |
| `quota_exceeded` | 429 | "일일 사용량을 초과했습니다." |
| `invalid_key` | 500 | (Gemini API 키 문제 — 내부) |
| `missing_key` | 500 | (GEMINI_API_KEY 미설정 — 내부) |
| `parse_error` | 502 | "YouTube 페이지 / 자막 형식을 해석할 수 없습니다." |
| `upstream_error` | 502 | "AI/YouTube 서버 오류." |
| `invalid_response` | 502 | "서버 응답을 해석할 수 없습니다." |

### 2.4 쿼터 정책

`generate-content` 와 동일 (`_shared/usage.ts` 의 `DAILY_QUOTA_BY_PLAN`):

| Plan | 1분 한도 | 1일 한도 |
|------|---------|---------|
| `free` | 10 | 3 |
| `pro` | 10 | 100 |
| `unlimited` | 10 | ∞ |
| `is_admin=true` | ∞ | ∞ |

**feature 값:** `extract_youtube` — `usage_logs.feature` 에 기록.

### 2.5 부수 효과

- **성공 시**: `usage_logs` 1행 INSERT (`feature='extract_youtube'`, `cost_tokens = blogPost.tokensUsed`)
- **YouTube fetch 실패 시**: INSERT 없음 (비용 미발생)
- **Gemini 실패 시**: INSERT 없음 (비용 미발생 — YouTube 만 불렀으므로 토큰 0)
- **로그 실패**: 응답 변경 없음, `console.warn` 만

### 2.6 보안

- `GEMINI_API_KEY` 는 `Deno.env.get()` 에서만 읽음 (하드코딩 0건)
- YouTube 자막 fetch 는 **타사 라이브러리 미사용** — youtube.com 의 공개 페이지와
  `&fmt=json3` 자막 엔드포인트만 사용.
- 프롬프트 주입 방어: 자막·영상 메타데이터를 `<<<TRANSCRIPT_START>>>` / `<<<VIDEO_META_START>>>`
  fence 로 격리. fence 토큰이 자막 내부에 있으면 sanitize 가 공백으로 치환.
- transcript 길이 상한 12,000자 (프롬프트 비용·집중도).
- 로그 내용: userId · videoId · 에러 코드만. 자막 원문·API 키 로깅 없음.

### 2.7 extension-core / UI 참조

```js
// background/handlers/youtube-handler.js (이미 구현됨)
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.action !== 'extractYoutube') return false
  handleExtractYoutube(msg, { supabase, supabaseUrl: SUPABASE_URL })
    .then(sendResponse)
  return true  // 비동기 응답
})

// sidepanel/tabs/youtube-tab.js (이미 구현됨)
const resp = await chrome.runtime.sendMessage({
  action: 'extractYoutube',
  videoUrl: url,
  options: { length: 'normal', targetLanguage: 'ko' }
})
// resp.data.blogPost.{title, content} → UI 렌더
// resp.data.transcript.text → "원본 자막 보기" 섹션
// "생성 탭으로 보내기" → chrome.storage.session.__generate_seed 에 기록
```



## 3. (예정) `POST /functions/v1/verify-subscription`

**상태:** Phase 8 예정.
- JWT 검증 **미사용** (webhook, 인증 사용자 없음)
- 대신 결제 게이트웨이 서명 검증 + service_role 로 `subscriptions` / `profiles` 업데이트

## 4. (예정) `POST /functions/v1/admin-actions`

**상태:** Phase 관리자 기능 예정.
- JWT 검증 + `profiles.is_admin=true` 체크
- service_role 사용 (관리자 전용)

---

## 5. 변경 이력

| 날짜 | 변경 | 관련 파일 |
|------|------|----------|
| 2026-04-14 | generate-content (Phase 5.1) 초판 | `supabase/functions/generate-content/*`, `supabase/functions/_shared/*` |
| 2026-04-14 | extract-youtube (Phase 6) 초판 — §2 전체 신설 | `supabase/functions/extract-youtube/*`, `_shared/youtube.ts`, `_shared/blog-transform.ts`, `extension/background/handlers/youtube-handler.js`, `extension/sidepanel/tabs/youtube-tab.*` |
