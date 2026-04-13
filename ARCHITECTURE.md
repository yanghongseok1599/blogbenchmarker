# BLOG BenchMarker - 아키텍처

## 폴더 구조

```
BLOG BenchMarker/
├── extension/                          # 크롬 확장프로그램 본체
│   ├── manifest.json
│   ├── background/
│   │   ├── service-worker.js          # 진입점, 메시지 라우터만
│   │   └── handlers/                  # 메시지 핸들러 (one per file)
│   │       ├── auth-handler.js
│   │       ├── analyze-handler.js
│   │       ├── generate-handler.js
│   │       ├── benchmark-handler.js
│   │       └── usage-handler.js
│   ├── content/
│   │   ├── extractor.js               # 블로그 글 추출
│   │   ├── analyzer.js                # SEO 점수 계산
│   │   ├── sidebar-injector.js        # 글쓰기 페이지 사이드바
│   │   └── content.css
│   ├── sidepanel/
│   │   ├── panel.html
│   │   ├── panel.js                   # 라우터만, 각 탭은 별도 파일
│   │   ├── tabs/
│   │   │   ├── analyze-tab.js
│   │   │   ├── generate-tab.js
│   │   │   ├── benchmark-tab.js
│   │   │   └── settings-tab.js
│   │   └── panel.css
│   ├── auth/
│   │   ├── login.html
│   │   └── login.js                   # Supabase Auth UI
│   ├── mypage/
│   │   ├── mypage.html
│   │   └── mypage.js                  # 구독, 사용량, 결제
│   ├── lib/
│   │   ├── supabase-client.js         # Supabase 초기화
│   │   ├── env-config.example.js
│   │   ├── env-config.js              # .gitignore
│   │   ├── repositories/              # DB 추상화 계층
│   │   │   ├── user-repo.js
│   │   │   ├── learning-repo.js
│   │   │   ├── benchmark-repo.js
│   │   │   └── usage-repo.js
│   │   ├── analyzers/
│   │   │   ├── seo-analyzer.js
│   │   │   ├── nlp-utils.js
│   │   │   └── hook-detector.js       # 첫 문장 후킹 (개선판)
│   │   └── utils/
│   │       ├── clipboard.js           # 안전한 복사 + 폴백
│   │       ├── i18n.js                # 다국어
│   │       └── dom-safe.js            # XSS 방지 헬퍼
│   ├── _locales/                       # 다국어 리소스
│   │   ├── ko/messages.json
│   │   ├── en/messages.json
│   │   └── ja/messages.json
│   └── icons/
│
├── supabase/                           # Supabase 프로젝트
│   ├── migrations/                    # SQL 마이그레이션
│   │   ├── 20260413_001_users.sql
│   │   ├── 20260413_002_learning_data.sql
│   │   ├── 20260413_003_benchmarks.sql
│   │   ├── 20260413_004_usage_logs.sql
│   │   ├── 20260413_005_settings.sql
│   │   └── 20260413_006_rls.sql
│   ├── functions/                     # Edge Functions
│   │   ├── generate-content/          # Gemini 호출 (서버)
│   │   ├── extract-youtube/
│   │   ├── verify-subscription/       # Webhook 검증
│   │   └── admin-actions/
│   └── seed.sql
│
├── docs/
│   ├── api.md
│   └── deployment.md
│
├── CLAUDE.md
├── PRD.md
├── ARCHITECTURE.md
├── TASKS.md
└── REFERENCE.md
```

## Supabase 데이터베이스 스키마

### users (auth.users 확장)
```sql
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  display_name TEXT,
  nickname TEXT,
  plan TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'pro', 'unlimited')),
  plan_expires_at TIMESTAMPTZ,
  usage_count INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_admin BOOLEAN NOT NULL DEFAULT false,
  language TEXT DEFAULT 'ko',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_login_at TIMESTAMPTZ
);
```

### learning_data
```sql
CREATE TABLE public.learning_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_url TEXT,
  title TEXT,
  content TEXT,
  seo_score INTEGER,
  analysis JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_learning_user ON learning_data(user_id, created_at DESC);
```

### benchmark_blogs (즐겨찾기 경쟁 블로그)
```sql
CREATE TABLE public.benchmark_blogs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  blog_url TEXT NOT NULL,
  blog_name TEXT,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, blog_url)
);
```

### benchmark_posts (벤치마킹 글 캐시)
```sql
CREATE TABLE public.benchmark_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  benchmark_blog_id UUID NOT NULL REFERENCES benchmark_blogs(id) ON DELETE CASCADE,
  post_url TEXT NOT NULL,
  title TEXT,
  content_summary TEXT,
  seo_score INTEGER,
  word_count INTEGER,
  image_count INTEGER,
  posted_at TIMESTAMPTZ,
  scraped_at TIMESTAMPTZ DEFAULT NOW()
);
```

### usage_logs
```sql
CREATE TABLE public.usage_logs (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_usage_user_date ON usage_logs(user_id, created_at DESC);
```

### app_settings (단일 행, 관리자만 수정)
```sql
CREATE TABLE public.app_settings (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  free_access_enabled BOOLEAN DEFAULT false,
  daily_free_quota INTEGER DEFAULT 3,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### subscriptions (결제 이력)
```sql
CREATE TABLE public.subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  payment_provider TEXT,
  payment_id TEXT,
  amount INTEGER,
  starts_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  status TEXT CHECK (status IN ('active', 'expired', 'refunded')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

## RLS 정책

```sql
-- profiles: 본인만 읽기/수정, 관리자 전체
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own profile" ON profiles
  FOR ALL USING (auth.uid() = id);
CREATE POLICY "admin all profiles" ON profiles
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin)
  );

-- learning_data: 본인만
ALTER TABLE learning_data ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own learning" ON learning_data
  FOR ALL USING (auth.uid() = user_id);

-- benchmark_blogs/posts: 본인만
ALTER TABLE benchmark_blogs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own benchmarks" ON benchmark_blogs
  FOR ALL USING (auth.uid() = user_id);

-- usage_logs: 본인 INSERT/SELECT, 관리자 전체
ALTER TABLE usage_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own logs insert" ON usage_logs
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own logs select" ON usage_logs
  FOR SELECT USING (auth.uid() = user_id);

-- app_settings: 모두 SELECT, 관리자만 UPDATE
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone reads" ON app_settings FOR SELECT USING (true);
CREATE POLICY "admin updates" ON app_settings FOR UPDATE USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin)
);

-- subscriptions: 본인 SELECT, Edge Function만 INSERT
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own subscriptions" ON subscriptions
  FOR SELECT USING (auth.uid() = user_id);
```

## Edge Functions

### generate-content
- 입력: prompt, options, userId
- 처리: 사용량 체크 → Gemini 호출 → usage_logs 기록
- 출력: 생성된 글
- 이유: API 키 보호 + 사용량 검증을 서버에서

### extract-youtube
- 입력: youtube URL
- 처리: 자막 추출 (yt-dlp 또는 YouTube Data API)
- 출력: 텍스트
- 이유: CORS 우회 + API 키 보호

### verify-subscription (webhook)
- 입력: 결제 webhook payload
- 처리: 결제 검증 → subscriptions/profiles 업데이트
- 이유: 클라이언트 위변조 방지

### admin-actions
- 입력: action, params, adminToken
- 처리: 관리자 전용 작업 (유저 차단, 플랜 수동 부여 등)
- 이유: RLS만으로 부족한 복잡한 권한 처리

## 메시지 패싱 패턴

```
sidepanel/content → background → handlers/{action}-handler.js
                                    ↓
                             repositories/*.js
                                    ↓
                              Supabase / API
```

규칙:
- handler는 반드시 `{ ok: boolean, data?, error? }` 형태로 응답
- handler는 UI 상태 모르게 (재사용성)
- repository는 supabase 객체만 의존 (테스트 가능)

## 인증 흐름

1. login.js에서 `supabase.auth.signInWithPassword()` 호출
2. 세션은 Supabase JS SDK가 chrome.storage에 자동 저장 (커스텀 storage adapter 필요)
3. 모든 API 호출은 SDK가 자동으로 JWT 첨부 + 갱신
4. 토큰 만료 처리는 Supabase가 자동 (현재 코드처럼 수동 갱신 불필요)
5. 서비스 워커는 별도 supabase client 인스턴스 생성 (storage 공유)

## 사용량 체크 흐름

1. AI 생성 요청 → background/handlers/generate-handler
2. usage-repo가 오늘 usage_logs count 조회
3. 플랜별 quota 비교
4. 초과 시 에러, 미만 시 generate-content Edge Function 호출
5. 응답 후 usage_logs INSERT

## Realtime 사용처

- benchmark_blogs 테이블 구독 → 다른 기기에서 즐겨찾기 추가 시 즉시 반영
- profiles 테이블의 plan 필드 구독 → 결제 완료 시 즉시 PRO로 전환
