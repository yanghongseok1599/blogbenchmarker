// 이 파일은 커밋 대상 (템플릿).
// 실제 키는 `env-config.js`에 저장하며, 해당 파일은 .gitignore 된다.
//
// 사용 절차:
// 1. 이 파일을 `env-config.js`로 복사
// 2. Supabase 대시보드 > 프로젝트 > Copy 버튼 팝업에서 값 복사
//    - Project URL → SUPABASE_URL
//    - Publishable key (sb_publishable_...) → SUPABASE_ANON_KEY
//      (Supabase가 2025년 "anon key"를 "Publishable key"로 이름 변경. 역할 동일.)
// 3. `env-config.js`에 실제 값 입력
//
// 중요:
// - sb_secret_* 키는 절대 이 파일이나 확장프로그램 번들에 포함하지 않는다.
//   (과거 service_role 역할. Edge Function의 Supabase Secrets로만 관리:
//    `supabase secrets set SUPABASE_SERVICE_ROLE_KEY=sb_secret_...`)
// - Gemini, YouTube, 결제 키 등 외부 API 키도 Edge Function 서버측에서만 사용.
// - Publishable key는 RLS 정책으로 보호되므로 클라이언트에 노출되어도 안전하다.

export const SUPABASE_URL = 'https://your-project-ref.supabase.co'
export const SUPABASE_ANON_KEY = 'sb_publishable_YOUR_KEY_HERE'
