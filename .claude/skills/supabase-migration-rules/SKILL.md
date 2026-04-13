---
name: supabase-migration-rules
description: Supabase SQL 마이그레이션·RLS 정책·Edge Function 작성 시 반드시 사용. "Supabase 마이그레이션", "SQL 작성", "RLS", "Edge Function", "auth.uid", "public.profiles", "테이블 생성", "DB 스키마", "트리거", "JWT 검증", "Gemini 호출"이 언급되면 이 스킬을 로드한다. 후속 트리거: "RLS 수정", "정책 추가", "마이그레이션 롤백", "DB 변경". 보안 경계(키 보호, JWT 검증, 사용량 위변조 방지)를 지키는 표준 패턴을 제공한다.
---

# Supabase Migration & Edge Function Rules

## 이 스킬이 전달하는 것

이 프로젝트에서 반복되는 SQL·RLS·Edge Function 작성 실수를 방지하기 위한 **검증된 패턴 모음**이다. `supabase-backend` 에이전트가 산출물을 만들 때마다 이 스킬을 로드해 체크리스트로 사용한다.

## 1. 마이그레이션 파일 규칙

### 1-1. 네이밍
- 형식: `supabase/migrations/YYYYMMDD_NNN_{purpose}.sql`
- 예: `20260413_001_users.sql`, `20260420_007_alter_profiles_add_locale.sql`
- 이미 배포된 마이그레이션 파일은 **수정 금지.** 변경은 항상 새 파일(`alter_*`)로.

### 1-2. Idempotent 작성 (필수)
모든 마이그레이션은 재실행해도 안전해야 한다. `supabase db reset` → 전체 재적용 흐름을 가정.

```sql
-- 테이블
CREATE TABLE IF NOT EXISTS public.profiles (...);

-- 정책 (교체 패턴)
DROP POLICY IF EXISTS "own profile" ON public.profiles;
CREATE POLICY "own profile" ON public.profiles
  FOR ALL USING (auth.uid() = id);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_learning_user ON learning_data(user_id, created_at DESC);

-- 함수/트리거
CREATE OR REPLACE FUNCTION public.handle_new_user() ...
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users ...
```

**이유:** 순서 의존·부분 실패를 방지. 개발 중 스키마를 자주 재구성하는 환경에서 필수.

### 1-3. Rollback 주석
각 마이그레이션 하단에 역순 SQL을 주석으로 남긴다. 긴급 롤백 시 복사해서 새 마이그레이션으로 만든다.

```sql
-- ROLLBACK:
-- DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
-- DROP FUNCTION IF EXISTS public.handle_new_user();
-- DROP TABLE IF EXISTS public.profiles;
```

## 2. RLS 표준 패턴

### 2-1. 모든 public 테이블은 RLS ON (예외 없음)
```sql
ALTER TABLE public.learning_data ENABLE ROW LEVEL SECURITY;
```

**이유:** RLS를 깜빡 OFF 두면 anon key만으로 전체 데이터 접근 가능. 배포 후 발견하면 전 사용자 데이터 유출 리스크.

### 2-2. 본인 접근 (가장 흔한 패턴)
```sql
CREATE POLICY "own learning" ON public.learning_data
  FOR ALL USING (auth.uid() = user_id);
```

`FOR ALL`은 SELECT·INSERT·UPDATE·DELETE 모두 포함. 개별 제어가 필요하면 `FOR SELECT`, `FOR INSERT WITH CHECK (...)`, `FOR UPDATE USING (...)` 로 분리.

### 2-3. 관리자 접근 — is_admin 플래그만 사용

```sql
CREATE POLICY "admin all profiles" ON public.profiles
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin)
  );
```

**절대 금지:**
- 이메일 비교 (`auth.email() = 'admin@...'`) — 이메일은 변경 가능, 하드코딩 리스크
- JWT 클레임 직접 파싱 (`auth.jwt() ->> 'role'`) — 토큰 위변조 고려 필요, profiles 조회가 안전

**이유:** 관리자 권한은 DB 상태(profiles.is_admin)를 단일 진실의 원천으로 삼아야 추적·취소·감사가 가능.

### 2-4. INSERT 검증 — WITH CHECK 필수
```sql
CREATE POLICY "own logs insert" ON public.usage_logs
  FOR INSERT WITH CHECK (auth.uid() = user_id);
```

`USING`은 기존 행에 대한 접근 제어, `WITH CHECK`는 새 행의 값에 대한 제약. INSERT는 `WITH CHECK`가 필요.

### 2-5. 공개 읽기 + 제한 쓰기
```sql
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone reads settings" ON public.app_settings FOR SELECT USING (true);
CREATE POLICY "admin updates settings" ON public.app_settings FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin)
);
```

## 3. profiles 자동 생성 트리거

회원가입 시 `auth.users` → `public.profiles` 자동 동기화.

```sql
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name, plan, language)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)),
    'free',
    COALESCE(NEW.raw_user_meta_data->>'language', 'ko')
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

`SECURITY DEFINER`가 필요한 이유: 트리거는 auth schema 권한으로 실행되므로, `search_path` 고정으로 permission escalation 방지.

## 4. Edge Function 표준

### 4-1. JWT 검증 (모든 Edge Function 첫 단계)

```ts
// supabase/functions/generate-content/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return new Response(JSON.stringify({ ok: false, error: 'Missing Authorization' }), {
      status: 401, headers: { 'Content-Type': 'application/json' }
    })
  }

  // anon key + JWT 헤더 전달 → RLS 자동 적용
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } }
  )

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return new Response(JSON.stringify({ ok: false, error: 'Invalid token' }), { status: 401 })
  }

  // ... 사용량 체크 → Gemini 호출 → usage_logs INSERT
})
```

### 4-2. Service Role Key는 admin-actions에만

`SUPABASE_SERVICE_ROLE_KEY`는 RLS를 우회한다. 다음 경우에만 사용:
- `admin-actions/`: 복잡한 관리자 권한 처리
- `verify-subscription/`: webhook은 인증된 사용자 없이 실행되므로 service role로 subscriptions/profiles 업데이트 필요. 단, webhook 서명 검증이 선행되어야 함.

그 외 모든 Edge Function은 **anon key + JWT 전달** 방식.

**이유:** service role 남용은 RLS 전체 우회와 같다. 사용 파일을 소수로 제한해야 코드 리뷰·감사가 가능.

### 4-3. API 키 관리
```bash
# Supabase Secrets로만 관리
supabase secrets set GEMINI_API_KEY=...
supabase secrets set YOUTUBE_API_KEY=...
supabase secrets set TOSS_SECRET_KEY=...
```

Edge Function 내부:
```ts
const geminiKey = Deno.env.get('GEMINI_API_KEY')
if (!geminiKey) throw new Error('GEMINI_API_KEY not configured')
```

**금지:**
- 소스코드 하드코딩
- supabase/functions/*/deno.json 등 프로젝트 파일에 키 포함
- 로그에 키·토큰 출력 (`console.log(apiKey)` 금지)

### 4-4. 사용량 검증 (generate-content 패턴)

```ts
// 1. 오늘 사용량 조회
const { count } = await supabase
  .from('usage_logs')
  .select('id', { count: 'exact', head: true })
  .eq('user_id', user.id)
  .gte('created_at', new Date(Date.now() - 86400000).toISOString())

// 2. 플랜별 quota 비교
const { data: profile } = await supabase
  .from('profiles').select('plan, plan_expires_at').eq('id', user.id).single()

const quota = { free: 3, pro: Infinity, unlimited: Infinity }[profile.plan] ?? 3
if (count >= quota) {
  return new Response(JSON.stringify({
    ok: false, error: 'quota_exceeded', data: { used: count, quota }
  }), { status: 429 })
}

// 3. Gemini 호출 (성공 시)
// ...

// 4. usage_logs INSERT
await supabase.from('usage_logs').insert({ user_id: user.id, action: 'generate_content', details: {...} })
```

**클라이언트 검증은 UX 힌트일 뿐 신뢰 금지.** 실제 제한은 Edge Function에서만.

### 4-5. 응답 shape 통일

모든 Edge Function 응답:
```ts
// 성공
{ ok: true, data: { ... } }  // HTTP 200

// 실패
{ ok: false, error: 'human-readable message', code?: 'quota_exceeded' }  // HTTP 4xx/5xx
```

HTTP status + `ok` 불린 둘 다 검사 가능하게.

### 4-6. CORS 헤더
Chrome Extension이 호출하므로 CORS 설정 필수:

```ts
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',  // 또는 chrome-extension://{id}
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

// 실제 응답에도 corsHeaders 포함
```

## 5. 흔한 실수 체크리스트

- [ ] RLS ENABLE 누락 → `SELECT tablename FROM pg_tables WHERE schemaname='public' AND rowsecurity=false`로 확인
- [ ] is_admin 정책이 이메일 비교 → `grep -n "auth.email()" supabase/migrations/`
- [ ] Edge Function에 API 키 하드코딩 → `grep -rE "AIza|sk_live|GEMINI_API_KEY\s*=\s*['\"]" supabase/functions/`
- [ ] JWT 검증 없이 작업 수행 → 모든 Edge Function 첫 20줄에 `getUser()` 또는 `authHeader` 검사 존재
- [ ] 사용량 체크가 클라이언트에만 → Edge Function에도 동일 검증
- [ ] CORS OPTIONS 미처리 → chrome-extension 호출 실패 (CORS 에러)

## 6. 배포 명령

```bash
# 마이그레이션
supabase db push

# Edge Function 개별
supabase functions deploy generate-content

# Secrets
supabase secrets set KEY=value
supabase secrets list
```

완료 보고에 이 명령을 포함해 사용자가 즉시 실행할 수 있도록 한다.
