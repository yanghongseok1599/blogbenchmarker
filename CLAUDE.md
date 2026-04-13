# BLOG BenchMarker - 프로젝트 컨텍스트

이 문서는 Claude Code 세션이 자동 로드합니다. 모든 작업 전 반드시 숙지하세요.

## 프로젝트 개요

네이버 블로그 SEO 분석 + AI 글 생성 + 경쟁 블로그 벤치마킹 크롬 확장프로그램.
기존 "블로그 부스터 Pro"의 후속 버전으로, **Supabase 백엔드**로 새로 구축합니다.

기존 프로젝트 위치: `/Users/seok/AI PROJECT/확장프로그램/BLOG BOOSTER/blog-booster-pro/`
참고 매핑: `REFERENCE.md` 참조

## 기술 스택 (확정)

- **확장프로그램**: Chrome Manifest V3
- **백엔드**: Supabase (Auth, PostgreSQL, RLS, Edge Functions, Realtime)
- **AI**: Google Gemini API (gemini-2.5-flash 기본)
- **결제**: 토스페이먼츠 또는 포트원 (추후 결정)
- **배포**: Chrome Web Store

## 핵심 원칙

### 보안
- **API 키 절대 하드코딩 금지**. `lib/env-config.example.js` 만 커밋, `lib/env-config.js`는 .gitignore
- Gemini API 호출은 **Supabase Edge Functions**에서. 클라이언트에 키 노출 금지
- 관리자 권한은 Supabase RLS + JWT 클레임으로 검증. 이메일 비교 금지
- `innerHTML` 사용 금지. 사용자 입력은 `textContent` 또는 DOM API로 처리

### 코드 품질
- 파일당 500줄 이하 유지. 초과 시 모듈 분리
- console.log는 개발 중에만. 프로덕션 빌드 시 제거
- 모든 외부 호출은 try-catch + 사용자에게 명확한 에러 전달
- 한글 주석 OK. 핵심 로직(WHY)에만 작성, WHAT은 코드로 설명

### 아키텍처
- 메시지 핸들러는 `background/handlers/` 폴더로 분리 (one handler per file)
- DB 접근은 `lib/repositories/` 계층에 추상화. 컴포넌트에서 직접 supabase 호출 금지
- 상태 관리: chrome.storage.local은 캐시 용도만. 진실의 원천은 Supabase

## 작업 흐름

1. 작업 시작 전 `TASKS.md`에서 자기 작업 확인 + `[in_progress]` 마킹
2. 다른 세션과 충돌 가능한 파일은 작업 시작 전 선언
3. 완료 시 `TASKS.md`에 `[done]` + 커밋 해시 기록
4. PR 단위로 작업 (한 작업 = 한 PR 가능 단위)

## 절대 금지

- 기존 `blog-booster-pro` 폴더 수정 (참고만)
- Firebase SDK 사용
- API 키 하드코딩
- innerHTML로 사용자 입력 렌더링
- 관리자 비밀번호 하드코딩
- 미사용 코드/주석 처리된 코드 커밋

## 참고 문서

- `PRD.md` - 무엇을 만들 것인가
- `ARCHITECTURE.md` - 어떻게 만들 것인가
- `TASKS.md` - 누가 무엇을 하는가
- `REFERENCE.md` - 기존 코드 어디를 볼 것인가

## 하네스: BLOG BenchMarker

**목표:** Chrome Extension(MV3) + Supabase 백엔드로 구성된 12개 Phase 개발을 전문 에이전트 팀으로 조율해 오류 없이 완수한다.

**트리거:** 이 프로젝트의 개발·구현·검증 요청(Phase 번호, "Supabase 셋업", "RLS", "Edge Function", "SEO 분석", "벤치마킹", "AI 글 생성", TASKS.md 항목 등)이 들어오면 반드시 `blog-benchmarker-orchestrator` 스킬을 사용하라. 단순 질문은 직접 응답 가능.

**에이전트:** supabase-backend, extension-core, ui-builder, analyzer-specialist, security-qa (`.claude/agents/`)

**스킬:** blog-benchmarker-orchestrator(메인), supabase-migration-rules, chrome-extension-security, seo-analyzer-rules, boundary-qa, legacy-port-guide (`.claude/skills/`)

**변경 이력:**
| 날짜 | 변경 내용 | 대상 | 사유 |
|------|----------|------|------|
| 2026-04-13 | 초기 구성 (에이전트 5 + 스킬 6) | 전체 | 신규 프로젝트 하네스 구축 |
