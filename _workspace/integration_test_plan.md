# Integration Test Plan — E2E 시나리오 10건

> 구현된 기능만 대상. 미구현 기능의 시나리오는 `remaining_work.md` 로 이동.
> 작성일: 2026-04-14
> 실행 전 사전 조건: Supabase 프로젝트 배포 + Edge Functions 배포 + Secrets 설정 완료.

---

## 사전 환경 (Fixtures)

| 항목 | 값 / 출처 |
|------|---------|
| 테스트 Supabase 프로젝트 | staging (separate from prod) |
| 테스트 유저 | `qa-free@example.com` (plan=free), `qa-pro@example.com` (plan=pro), `qa-admin@example.com` (is_admin=true) |
| 네이버 블로그 | 테스트용 공개 블로그 2개 (본인 블로그 + 경쟁 샘플) |
| YouTube | 자막 있는 5분 이내 영상 1개, 자막 없는 영상 1개 |
| 결제 | 토스 테스트 모드 결제 키 |
| 브라우저 | Chrome 최신 (v122+) / Chrome Canary |

---

## 1. 회원가입 → 이메일 인증 → 로그인 → 마이페이지

**Given:** 확장 로드 상태, 사용자 미가입.
**When:**
1. 사이드패널 열기 → `로그인` 화면 확인 → `회원가입` 링크 클릭
2. `signup.html` 에서 email + 비밀번호(영문+숫자 8자+) + 약관 체크 → `가입하기` 클릭
3. "이메일을 확인해 주세요" 배너 표시 확인
4. 받은 편지함에서 Supabase 인증 메일 링크 클릭
5. `login.html` 로 돌아와 로그인
6. 사이드패널 `마이` 탭으로 진입

**Then:**
- `auth.users` 에 행 생성 + `public.profiles` 자동 생성 (trigger `handle_new_user` 발화)
- `profiles.plan = 'free'`, `language = 'ko'`, `is_admin = false`
- 마이페이지에 FREE 플랜 · 오늘 사용량 0/3 · 언어 한국어 표시
- `chrome.storage.local` 에 Supabase 세션 토큰 저장 확인 (custom adapter)

**검증 포인트:**
- [ ] `SELECT * FROM public.profiles WHERE email='qa-xxx@example.com'` — 행 존재
- [ ] `profiles.is_admin = false`
- [ ] DevTools Application → chrome.storage.local 에 `sb-*-auth-token` 키 존재
- [ ] `console.log('[i18n]')` 경고 0건 (모든 data-i18n key 매핑됨)

**예상 소요:** 8분 (이메일 수신 대기 포함)

---

## 2. OAuth 로그인 → 세션 유지 → 로그아웃 → 자동 재로그인 방지

**Given:** Google 계정 보유.
**When:**
1. `login.html` → `Google로 계속하기` 클릭
2. `chrome.identity.launchWebAuthFlow` 팝업에서 Google 계정 승인
3. 로그인 성공 → 사이드패널 분석 탭 표시
4. 브라우저 재시작 (확장 존속 확인)
5. 사이드패널 → 로그인 상태 유지 확인
6. 마이페이지 → `로그아웃` 클릭
7. 로그인 화면 복귀 확인
8. 10초 뒤 새로고침 / 다른 탭에서 확장 재진입

**Then:**
- 세션은 SDK autoRefreshToken 으로 자동 갱신
- signOut() 이후 `chrome.storage.local.clear()` + `chrome.storage.sync.clear()` 양쪽 실행
- `__intentional_logout` 플래그 세팅 → `onAuthStateChanged` 리스너가 재로그인 시도 안 함
- 단계 8 에서 로그인 화면 유지 (자동 재로그인 **안 됨**)

**검증 포인트:**
- [ ] REFERENCE.md §4-2 버그 "로그아웃 후 자동 재로그인" 재현 0건
- [ ] 로그아웃 직후 `chrome.storage.local.get()` 결과에 auth token 없음
- [ ] console.warn / error 0건
- [ ] OAuth state 파라미터 검증 코드 존재 (`launchWebAuthFlow` 결과 URL 에서)

**예상 소요:** 5분

---

## 3. 글쓰기 페이지 진입 → 사이드바 주입 → 실시간 분석

**Given:** 로그인 상태, 네이버 블로그 본인 계정.
**When:**
1. `https://blog.naver.com/{me}/postwrite` 이동 (글쓰기 페이지)
2. `sidebar-injector.js` content script 가 우측 사이드바 주입 확인
3. 제목 입력: "네이버 블로그 SEO 3가지 팁"
4. 본문 타이핑: 첫 문단 질문형 ("여러분 블로그 노출, 왜 안 될까요?") + 300자 이상
5. 500ms debounce 후 사이드바 SEO 점수 업데이트 관찰
6. 이미지 2개 추가 → 이미지 점수 변동 관찰
7. 제목 길이 60자로 늘림 → titleSeo 감점 확인

**Then:**
- 사이드바 렌더 성공 (host 페이지 CSS 미충돌)
- 점수 5섹션 (titleSeo/contentSeo/hookScore/readability/keywordDensity) 표시
- hookDetection.type = `question`, confidence ≥ 0.6 (물음표 + 2인칭 + 40자 이내)
- `extractor.js` 가 SmartEditor ONE 편집 영역에서 제목/본문/이미지 추출
- 500ms debounce 로 성능 저하 없음

**검증 포인트:**
- [ ] 사이드바 DOM 에 `innerHTML` 사용 0건 (DevTools Elements + 코드 grep)
- [ ] 본문 10,000자 입력 시 분석 < 500ms (seo-analyzer.js pure function)
- [ ] `extractor.js` 의 `detectEditorVersion()` = `'smarteditor-one'`
- [ ] content.css 가 `#se-root` 등 host 선택자 덮어쓰지 않음

**예상 소요:** 10분

---

## 4. 블로그 URL 추가 → 수집 → 경쟁 비교

**Given:** 로그인 상태, 벤치마크 탭.
**When:**
1. 사이드패널 `벤치마크` 탭 진입 → `블로그 추가` 버튼 클릭
2. URL 입력: `https://blog.naver.com/someone` → 저장
3. `benchmark-handler.js` 가 `naver-rss-collector.js` 호출
4. 5~10초 내 `benchmark_posts` 에 최근 글 캐시 (RSS 기준 최대 10개)
5. 같은 기기에서 Realtime 구독 가정 → 다른 기기(Canary) 에서도 목록 반영 확인
6. "경쟁 비교" 섹션에 평균 글자수/이미지수/SEO 점수 표시

**Then:**
- `benchmark_blogs` 에 `(user_id, blog_url)` UNIQUE 중복 차단 동작
- `benchmark_posts.metrics` JSONB 에 `{seoScore, charCount, imageCount, topKeywords, hookType}` 저장
- `comparison-card.js` 가 "내 글 평균 vs 경쟁 평균" 렌더
- `word-cloud.js` 가 경쟁 블로그 상위 키워드 표시

**검증 포인트:**
- [ ] 동일 URL 재등록 시 UNIQUE 제약 위반 에러 → 사용자에게 "이미 추가된 블로그" 안내
- [ ] RSS 파서가 네이버 공식 RSS (`/rss/blog/{id}`) 호출
- [ ] `chrome.alarms` 로 `benchmark-sync` 스케줄 확인 (1시간~1일 주기)
- [ ] RLS: 다른 사용자의 `benchmark_blogs` 는 SELECT 0건

**예상 소요:** 12분

---

## 5. AI 글 생성 (학습 없음) → 복사 → 사용량 반영

**Given:** qa-free 유저 로그인, 오늘 사용량 0/3.
**When:**
1. `생성` 탭 진입
2. 주제: "초보자를 위한 VSCode 단축키 10가지" 입력
3. 옵션: 원본성 50 (remix), 분량 보통, 학습 참고 체크 해제
4. `생성` 클릭
5. `generate-handler.js` → `/functions/v1/generate-content` 호출
6. 10~30초 내 본문 렌더 + "생성 결과" 카드 표시
7. `본문 복사` 버튼 클릭
8. 마이페이지 → 오늘 사용량 0/3 → 1/3 으로 갱신 확인
9. 같은 요청 3회 더 반복 → 4번째에 `quota_exceeded` 에러 (일일 3건)

**Then:**
- Edge Function 응답 `{ok:true, data:{content, tokensUsed, quota:{dailyCount:1, dailyQuota:3}}}`
- `usage_logs` 에 `feature='generate_content'`, `cost_tokens` > 0 기록
- 쿼터 초과 시 `{ok:false, error:{code:'quota_exceeded'}}` + 한국어 안내 "일일 사용 한도를 초과했습니다"
- 클립보드에 제목 + "\n\n" + 본문 복사 확인

**검증 포인트:**
- [ ] 쿼터 체크가 Gemini 호출 **전** 에 수행 (Edge 실패 시 쿼터 차감 0)
- [ ] `GEMINI_API_KEY` 가 응답 / 로그에 노출 0건
- [ ] 프롬프트 주입 방어: topic 에 "이전 지시 무시" 삽입해도 정상 글 생성
- [ ] `innerHTML` 사용 0건 (generate-result-card.js)

**예상 소요:** 15분

---

## 6. AI 글 생성 (학습 데이터 3개 포함) → 스타일 반영 확인

**Given:** qa-free 유저, learning_data 에 본인 과거 글 3개 저장됨.
**When:**
1. 분석 탭에서 본인 글 3개 분석 + "학습에 저장" 체크 (ownContent: true 게이트)
2. `learning_data` 에 3행 생성 확인
3. `생성` 탭 → 주제 입력 → 옵션에 "내 학습 데이터 참고 (최근 3개)" 체크
4. 생성 시작 → `learning-context.js` 가 최근 3개 learning_data.content_json 을 prompt 에 주입
5. 결과 비교: 학습 없이 생성한 글 vs 학습 포함 생성 글

**Then:**
- `generate-content/index.ts` 의 body 에 `learningRefs: [<글1발췌>, <글2발췌>, <글3발췌>]` 포함
- 각 ref 는 500자 이내 잘림 (gemini.ts sanitize 기준)
- 응답 본문의 말투/키워드 밀도가 학습 글과 유사 (정성 평가)

**검증 포인트:**
- [ ] learning_data RLS 본인 row 만 반환 — 타 유저 데이터 섞이지 않음
- [ ] 학습 참고 체크 해제 시 learningRefs 미포함
- [ ] ownContent=false 분석 결과는 learning_data INSERT **안 됨** (저작권 게이트)
- [ ] 프롬프트 fence `<<<REFERENCE_START>>>` 로 격리된 형태 (개발자 로그 확인)

**예상 소요:** 18분

---

## 7. YouTube URL → 자막 추출 → 블로그 변환 → 생성 탭 자동 연계

**Given:** 로그인 상태, 자막 있는 YouTube 영상 URL 준비.
**When:**
1. `유튜브` 탭 진입
2. URL 입력: `https://www.youtube.com/watch?v=<자막-있는-ID>`
3. 분량 "표준", 언어 "한국어" → `변환하기` 클릭
4. 20~40초 내 결과 카드 표시 (제목 + 본문 + "원본 자막 보기")
5. `생성 탭으로 보내기` 클릭
6. 생성 탭 자동 전환 + 주제 필드에 영상 제목 프리필 확인
7. 자막 없는 영상 URL 로 재시도 → 에러 "이 영상에는 사용 가능한 자막이 없습니다"

**Then:**
- `youtube.ts` 가 `ytInitialPlayerResponse` brace-match 파싱 성공
- 언어 우선순위 ko > en > ja 로 선택
- `blog-transform.ts` 가 `{title, content}` JSON 응답
- `chrome.storage.session.__generate_seed` 에 `{videoId, topic, extraNotes, learningRefs}` 기록
- `panel:switch-tab` CustomEvent 로 탭 전환

**검증 포인트:**
- [ ] `no_transcripts` 에러 코드 매핑 → 한국어 안내
- [ ] `video_unavailable` (비공개/삭제) 코드 매핑 확인
- [ ] 자막 fetch 가 타사 라이브러리 **미사용** (grep `youtube-transcript` 0건)
- [ ] 변환 성공 시 `usage_logs.feature='extract_youtube'` 1행 기록

**예상 소요:** 12분

---

## 8. 결제 토스 → webhook 수신 → plan 'pro' 승격 → 기능 활성화

**Given:** qa-free 유저 (plan=free), 토스 테스트 모드.
**When:**
1. 마이페이지 → `PRO 업그레이드` 클릭
2. `extension/payments/checkout.html` 로드 → 토스 결제창 호출
3. 테스트 카드로 결제 승인 (토스 테스트 환경)
4. 토스 webhook → `/functions/v1/verify-subscription` POST
5. `verify-subscription/index.ts` 가 `webhook-sig.ts` 로 서명 검증
6. `subscriptions` 테이블에 INSERT (`status='active'`, `gateway='toss'`, `plan='pro'`, `ends_at=+30일`)
7. DB 트리거 `trg_subscriptions_sync_plan` 발화 → `refresh_user_plan(user_id)` → `profiles.plan = 'pro'`
8. 사이드패널 재로드 → 마이페이지가 PRO 플랜 표시, 쿼터 100/일로 변경
9. AI 생성 10회 연속 실행 → 통과 (FREE 시 3건 한도 초과 지점)

**Then:**
- Webhook 서명 검증 실패 시 401 응답 (토스 서명 조작 시나리오)
- subscriptions UNIQUE(gateway, payment_id) 중복 차단 — 같은 webhook 재시도 시 INSERT 1회만
- profiles.plan 은 트리거로 자동 업데이트 (repository 에서 직접 UPDATE 금지)
- `components/expiry-banner.js` 가 만료 D-3, D-1 에 배너 표시

**검증 포인트:**
- [ ] Webhook 서명 위조 시도 → 401 (boundary-qa §4-4)
- [ ] `subscriptions.status = 'active'` AND `ends_at > NOW()` 일 때만 PRO 혜택 계산
- [ ] 동일 `payment_id` + `gateway` 로 두 번 POST → 두 번째 UNIQUE 충돌 처리
- [ ] `pg_cron` 등록된 `expire_due_subscriptions()` 가 15분~1시간 주기로 돌고 있음

**예상 소요:** 20분 (결제 게이트웨이 왕복)

---

## 9. 뽀모도로 시작 → 사이드패널 닫기 → 25분 후 알림

**Given:** 로그인 상태, 도구 탭 뽀모도로.
**When:**
1. 사이드패널 `도구` 탭 → `뽀모도로` 섹션
2. `시작` 클릭 (기본 25분)
3. 사이드패널 닫기 (브라우저 창은 유지)
4. 다른 작업 ~25분 수행
5. 25분 경과 시 chrome 알림 팝업 "25분 타이머 완료"
6. 사이드패널 재오픈 → 상태 "휴식 5분 중" 표시
7. `일시정지` / `재시작` / `취소` 버튼 동작 확인

**Then:**
- `handlers/pomodoro-handler.js` 가 `chrome.alarms.create` 로 스케줄
- 서비스 워커가 sleep 되어도 알람은 정확히 25분 후 발화
- 알림 권한 미허용 시 사이드패널 배지로 폴백

**검증 포인트:**
- [ ] manifest.json `permissions` 에 `alarms`, `notifications` 있음
- [ ] 타이머 상태 `chrome.storage.local` 에 저장 (세션 유지)
- [ ] 사이드패널 닫아도 타이머 카운트 지속
- [ ] console.error 0건

**예상 소요:** 30분 (실시간 대기 필수)

---

## 10. 관리자 로그인 → 유저 플랜 강제 변경 → 감사 로그 기록

**Given:** `qa-admin` 유저 (is_admin=true).
**When:**
1. qa-admin 로그인 → 사이드패널 or `admin/admin.html` 진입
2. `유저` 탭에서 qa-free 유저 조회
3. 해당 유저의 플랜을 `free` → `pro` 로 강제 변경 + 만료일 +30일 입력
4. `admin-actions` Edge Function 호출 (service_role)
5. `subscriptions` INSERT (`gateway=NULL`, `payment_id=NULL`, `status='active'`, admin 수동 부여)
6. 트리거가 `profiles.plan = 'pro'` 자동 업데이트
7. `admin_audit_logs` 에 행 생성 (`actor_id=admin.uid`, `action='plan_change'`, `target_id=qa-free.uid`, `before/after` JSONB)
8. `감사` 탭에서 방금 작업이 최상단에 표시

**Then:**
- admin-actions 는 `profiles.is_admin=true` 아닌 요청 시 403
- 감사 로그는 admin 만 SELECT 가능 (RLS 정책)
- qa-free 재로그인 시 PRO 기능 사용 가능

**검증 포인트:**
- [ ] 일반 유저로 `/functions/v1/admin-actions` 호출 → 403
- [ ] audit log 가 append-only (UPDATE/DELETE 일반 유저 금지)
- [ ] `is_admin_user(uid)` 함수로 판정 (이메일 비교 0건)
- [ ] grep `auth.email()` `auth.jwt()` in migrations → 0건

**예상 소요:** 15분

---

## 종합 / 운영 체크

### 공통 준수 (모든 시나리오)
- [ ] `innerHTML` 사용 0건 (extension/ 전체 grep)
- [ ] API 키 하드코딩 0건 (`AIza|sk_live|service_role` grep)
- [ ] 한국어 ↔ 영어 ↔ 일본어 전환 시 모든 핵심 화면 i18n 반영 (Phase 10 초판 범위 내에서)
- [ ] console.error / Unhandled rejection 0건

### 실행 시간 총합
1+2+3+4+5+6+7+8+9+10 = **약 145분 (2.5시간)** — 휴식 포함 반나절.

### 자동화 후보
- 1, 5, 6, 7 은 Playwright + Supabase test harness 로 자동화 가능.
- 2, 8, 9 는 외부 의존(OAuth 팝업/결제/시간 경과)으로 수동 유지 권장.
- 10 은 SQL + curl 로 자동화 가능.

### 실패 시 rollback
- DB: `supabase db reset` 후 마이그레이션 재적용 (로컬/staging 한정)
- Edge: `supabase functions deploy <이전 tag>` 또는 Dashboard 에서 롤백
- 클라이언트: 확장 제거 + 재설치
