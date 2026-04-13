// supabase/functions/_shared/auth.ts
// JWT 검증 + 사용자 컨텍스트 추출 헬퍼
//
// 원칙(.claude/skills/supabase-migration-rules §4-1 / §4-2):
//   - anon key + 클라이언트의 Authorization 헤더를 Supabase client 에 전달한다.
//   - 해당 client 로 조회하면 RLS 가 자동 적용되어 본인 row 만 읽힌다.
//   - service_role 은 이 함수에서 사용하지 않는다(관리자/Webhook 전용).

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

export type AuthProfile = {
  id: string
  email: string
  plan: 'free' | 'pro' | 'unlimited'
  is_admin: boolean
  language: string
}

export type AuthContext = {
  supabase: SupabaseClient
  userId: string
  profile: AuthProfile
}

export type AuthError = {
  code: 'missing_authorization' | 'invalid_token' | 'profile_not_found' | 'server_misconfig'
  message: string
  status: number
}

/**
 * 요청의 Authorization 헤더를 검증하고, 인증된 Supabase client 와 profile 을 반환한다.
 * 실패 시 AuthError 를 throw.
 */
export async function authenticate(req: Request): Promise<AuthContext> {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader || !authHeader.toLowerCase().startsWith('bearer ')) {
    throw asAuthError('missing_authorization', 'Authorization 헤더가 없습니다.', 401)
  }

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
  const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    // Secrets 미설정 — 개발자 실수. 사용자 메시지는 모호하게.
    throw asAuthError('server_misconfig', '서버 설정 오류. 관리자에게 문의하세요.', 500)
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false }
  })

  const { data: userResp, error: userErr } = await supabase.auth.getUser()
  if (userErr || !userResp?.user) {
    throw asAuthError('invalid_token', '인증 토큰이 유효하지 않습니다. 다시 로그인해 주세요.', 401)
  }
  const user = userResp.user

  // profiles 조회 — 본인 row 만 허용됨(RLS)
  const { data: profileRow, error: profileErr } = await supabase
    .from('profiles')
    .select('id, email, plan, is_admin, language')
    .eq('id', user.id)
    .single()

  if (profileErr || !profileRow) {
    throw asAuthError(
      'profile_not_found',
      '프로필 정보를 찾지 못했습니다. 잠시 후 다시 시도해 주세요.',
      404
    )
  }

  const profile: AuthProfile = {
    id: profileRow.id,
    email: profileRow.email,
    plan: (profileRow.plan ?? 'free') as AuthProfile['plan'],
    is_admin: Boolean(profileRow.is_admin),
    language: profileRow.language ?? 'ko'
  }

  return { supabase, userId: user.id, profile }
}

/**
 * AuthError 를 표준 에러 응답으로 변환.
 */
export function authErrorResponse(err: unknown, corsHeaders: Record<string, string> = {}): Response {
  const e = isAuthError(err)
    ? err
    : asAuthError('invalid_token', '인증 처리 중 오류가 발생했습니다.', 401)
  return new Response(
    JSON.stringify({ ok: false, error: { code: e.code, message: e.message } }),
    {
      status: e.status,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    }
  )
}

function asAuthError(code: AuthError['code'], message: string, status: number): AuthError {
  return { code, message, status }
}

function isAuthError(v: unknown): v is AuthError {
  return typeof v === 'object' && v !== null && 'code' in v && 'status' in v && 'message' in v
}
