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

## 2. (예정) `POST /functions/v1/extract-youtube`

**상태:** Phase 5.2 예정.
동일 envelope 규칙 적용 예정. topic 대신 `{ youtubeUrl: string }`.

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
