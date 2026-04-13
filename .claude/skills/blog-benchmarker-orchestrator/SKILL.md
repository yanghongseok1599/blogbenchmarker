---
name: blog-benchmarker-orchestrator
description: BLOG BenchMarker 프로젝트의 모든 개발·구현·검증 작업을 조율하는 메인 오케스트레이터. "BLOG BenchMarker", "블로그 벤치마커", "블로그 확장프로그램", "Phase 1.1", "Phase 2.1", "Phase 3.1" 등 Phase 번호, "Supabase 셋업", "RLS", "Edge Function", "SEO 분석", "벤치마킹", "AI 글 생성", "TASKS.md 작업"이 언급되면 반드시 이 스킬을 사용. 후속 트리거: "다시 실행", "재실행", "이어서", "업데이트", "수정", "보완", "다음 Phase", "Phase X.Y 작업". 이 프로젝트의 개발·구현·검증 요청이 오면 반드시 사용.
---

# BLOG BenchMarker Orchestrator

## 이 스킬이 조율하는 것

BLOG BenchMarker 프로젝트의 Phase 1~12 전체 개발 워크플로우. 5명의 전문 에이전트(supabase-backend, extension-core, ui-builder, analyzer-specialist, security-qa)를 Phase별로 재구성해 팀으로 실행한다.

## 실행 모드

**기본 모드:** 에이전트 팀 (TeamCreate + TaskCreate + SendMessage).  
**Phase별 팀 재구성 허용** — 각 Phase마다 필요한 에이전트만 `TeamCreate`하고 Phase 종료 시 `TeamDelete`.  
**모든 Agent 호출 시 `model: "opus"` 파라미터 필수.**

## Phase 0: 컨텍스트 확인

사용자 요청을 해석하기 전 다음을 확인한다:

1. `/Users/seok/AI PROJECT/확장프로그램/BLOG BenchMarker/TASKS.md`를 읽어 현재 진행 상태(`[x]`, `[in_progress]`, `[ ]`)를 파악한다
2. `_workspace/` 폴더 존재 여부 확인:
   - 미존재 → **초기 실행**
   - 존재 + 사용자가 특정 작업의 수정/개선 요청 → **부분 재실행** (해당 에이전트만 재호출, 기존 산출물 기반 개선)
   - 존재 + 사용자가 새 Phase 시작 요청 → **다음 Phase 실행**
3. Phase 0 결과를 한 줄로 사용자에게 요약 보고 후 다음 Phase로 진행

**이유:** 후속 요청에서 무엇을 새로 만들고 무엇을 보존할지 명확히 구분하지 않으면, 이전 산출물을 덮어써 작업 손실이 발생한다.

## Phase 1: 작업 범위 파악

사용자 요청이 TASKS.md의 어느 Phase/하위 작업에 해당하는지 매핑한다.

- "Phase 1.1" 같은 명시적 번호 → 그대로 사용
- "Supabase 셋업" 같은 키워드 → Phase 매트릭스(아래)에서 조회
- "SEO 분석 개선" 같은 일반 표현 → 사용자에게 어느 하위 작업인지 확인

## Phase 2: 팀 구성

아래 매트릭스에 따라 필요한 에이전트만 `TeamCreate`로 팀에 합류시킨다.

### Phase 매트릭스

| TASKS.md Phase | 팀원 | QA 시점 | 사용 스킬 |
|---|---|---|---|
| 1.1 Supabase 셋업 | supabase-backend | 종료 후 | supabase-migration-rules |
| 1.2 DB 스키마/RLS | supabase-backend, security-qa | **incremental** | supabase-migration-rules, boundary-qa |
| 1.3 확장 골격 | extension-core | 종료 후 | chrome-extension-security, legacy-port-guide |
| 2.1 Auth UI | ui-builder | 종료 후 | chrome-extension-security |
| 2.2 세션 관리 | extension-core, security-qa | **incremental** | chrome-extension-security, boundary-qa |
| 3.1 SEO 분석 엔진 | analyzer-specialist, extension-core | 종료 후 | seo-analyzer-rules, legacy-port-guide |
| 3.2 사이드바 | ui-builder | 종료 후 | chrome-extension-security |
| 3.3 분석 탭 | ui-builder | 종료 후 | chrome-extension-security |
| 4.1 즐겨찾기 UI | ui-builder, extension-core | 종료 후 | chrome-extension-security, supabase-migration-rules |
| 4.2 자동 수집 | extension-core, supabase-backend | 종료 후 | supabase-migration-rules, chrome-extension-security |
| 4.3 통계 뷰 | ui-builder, analyzer-specialist | 종료 후 | seo-analyzer-rules, chrome-extension-security |
| 5.1 Gemini Edge | supabase-backend, security-qa | **incremental** | supabase-migration-rules, boundary-qa |
| 5.2 생성 UI | ui-builder, extension-core | 종료 후 | chrome-extension-security |
| 6 YouTube Edge | supabase-backend, security-qa | **incremental** | supabase-migration-rules, boundary-qa |
| 7 학습 엔진 | analyzer-specialist, extension-core | 종료 후 | seo-analyzer-rules, supabase-migration-rules |
| 8.1 마이페이지 | ui-builder | 종료 후 | chrome-extension-security |
| 8.2 결제 webhook | supabase-backend, security-qa | **incremental** | supabase-migration-rules, boundary-qa |
| 9 부가 도구 | ui-builder | 종료 후 | chrome-extension-security |
| 10 다국어 | ui-builder | 종료 후 | chrome-extension-security |
| 11 관리자 | supabase-backend, ui-builder, security-qa | **incremental** | supabase-migration-rules, chrome-extension-security, boundary-qa |
| 12 배포 준비 | 전원 + security-qa 최종 audit | 최종 전수 | 모든 스킬 |

**Incremental QA란:** 해당 Phase 작업 중 각 산출물이 완성될 때마다 security-qa가 부분 검증한다. 전체 완성 후 1회 검증 금지 — 보안 결함을 늦게 발견할수록 수정 비용이 폭증.

## Phase 3: 작업 분배

`TaskCreate`로 Phase 내 세부 작업을 각 에이전트에 할당한다. 의존 관계는 `addBlockedBy`로 표현.

예 (Phase 1.2):
- `task_001_profiles_sql` (supabase-backend)
- `task_002_learning_data_sql` (supabase-backend, blockedBy: 001)
- `task_003_rls_policies_sql` (supabase-backend, blockedBy: 001, 002)
- `task_004_qa_check_rls` (security-qa, blockedBy: 003)

## Phase 4: 실행 및 통신

팀원들은 다음 수단으로 자체 조율한다:
- **SendMessage**: 실시간 shape 합의·질문·부분 결과 공유
- **TaskUpdate**: 진행 상태 공유 (in_progress/completed)
- **파일 기반**: `_workspace/` 공유 문서

### `_workspace/` 공유 문서 컨벤션

- `backend_schema_changelog.md` — supabase-backend가 스키마 변경 시마다 추가. extension-core·ui-builder가 참조.
- `handler_api.md` — extension-core가 handler action·shape 정의. ui-builder가 참조.
- `analyzer_result_shape.md` — analyzer-specialist가 분석 JSON shape 정의. ui-builder·learning-repo가 참조.
- `qa_report_{phase}.md` — security-qa가 검증 결과 기록.

### 파일명 컨벤션

중간 산출물: `_workspace/{phase}_{agent}_{artifact}.{ext}` (예: `_workspace/1.2_supabase-backend_001_users.sql.draft`).

최종 산출물은 ARCHITECTURE.md 지정 경로(`extension/`, `supabase/`)에. `_workspace/`는 보존(감사·재사용).

## Phase 5: QA (security-qa incremental)

매트릭스의 "incremental" 표시 Phase는 작업 중 수시로, 나머지는 Phase 종료 후 1회 security-qa가 `boundary-qa` 스킬 기준으로 검증.

발견 분류:
- **BLOCKER**: 해당 Phase 완료 보류 + 즉시 수정 요청
- **HIGH**: 다음 Phase 진행 전 수정
- **MEDIUM / LOW**: Phase 완료는 허용, 별도 과제로 추적

결과: `_workspace/qa_report_{phase}.md`에 기록.

## Phase 6: 완료 보고

모든 작업과 QA가 통과하면:

1. `TASKS.md`의 해당 항목을 `[ ]` → `[x]`로 업데이트 (커밋 해시는 사용자 입력 시에만)
2. 사용자에게 다음을 보고:
   - 생성·수정 파일 목록 (절대경로)
   - 사용자가 직접 실행해야 할 명령 (`supabase db push`, `chrome://extensions` 로드 등)
   - QA 리포트 요약
   - 다음 권장 Phase
3. 팀 해제: `TeamDelete` (다음 Phase에서 재구성)

## Phase 7: 피드백 및 하네스 진화

완료 보고 직후 사용자에게 피드백 기회를 제공:
- "산출물 품질에서 개선할 점 있나요?"
- "에이전트 역할이나 워크플로우에 수정 제안 있나요?"

피드백이 오면:
- 결과물 품질 → 해당 에이전트의 **스킬** 업데이트
- 에이전트 역할 부족/중복 → 에이전트 정의 수정 (추가/병합)
- 워크플로우 순서 → 이 오케스트레이터 매트릭스 수정
- 트리거 누락 → 스킬 `description` 확장

모든 변경은 프로젝트 `CLAUDE.md`의 **변경 이력** 테이블에 기록.

## 에러 핸들링

- **에이전트 작업 실패**: 1회 재시도. 재실패 시 해당 산출물 없이 진행하고 완료 보고서에 "누락" 명시. 사용자에게 에스컬레이션.
- **QA BLOCKER 발견**: 해당 Phase를 `[x]`로 마킹하지 않음. 수정 완료까지 다음 Phase 진행 보류.
- **팀원 간 shape 충돌**: 충돌한 양쪽 모두 보존(출처 병기), 오케스트레이터가 중재안 제시 후 사용자 승인받음.
- **Supabase 배포 실패**: SQL 오류면 supabase-backend가 마이그레이션 수정, 권한 오류면 사용자에게 Supabase 콘솔 작업 요청.

## 테스트 시나리오

### 정상 흐름: "Phase 1.1 시작"
1. Phase 0: TASKS.md 확인 → Phase 1.1 미착수, `_workspace/` 없음 → 초기 실행
2. Phase 1: 요청 매핑 → Phase 1.1 "Supabase 프로젝트 셋업"
3. Phase 2: supabase-backend 단독 팀 구성 (`TeamCreate`)
4. Phase 3: 작업 4개 분배 (Supabase 프로젝트 생성 가이드, env-config.example.js, .gitignore, 검증)
5. Phase 4: supabase-backend 실행, `supabase-migration-rules` 스킬 참조
6. Phase 5: Phase 1.1은 "종료 후" QA → security-qa가 API 키 노출 검사
7. Phase 6: TASKS.md 1.1 체크, 사용자에게 Supabase 콘솔에서 수동 프로젝트 생성 가이드 제공
8. Phase 7: 피드백 기회 제공

### 후속 흐름: "hook-detector false positive 개선 요청"
1. Phase 0: `_workspace/` 존재 + 3.1 이미 `[x]` → **부분 재실행**
2. Phase 1: 요청 매핑 → Phase 3.1 하위 hook-detector만
3. Phase 2: analyzer-specialist 단독 팀
4. Phase 3: 기존 `extension/lib/analyzers/hook-detector.js` 읽고 개선 작업 1개
5. Phase 4: `seo-analyzer-rules` 스킬의 3.3 (타입별 판정 규칙) 기준으로 재작성
6. Phase 5: Phase 종료 후 QA (정규식 ReDoS 검사, 결과 shape 보존 확인)
7. Phase 6: 변경 파일만 보고, TASKS.md 변경 없음(3.1은 이미 완료 상태)
8. 변경 이력 CLAUDE.md에 기록

## 원칙 요약

- 에이전트 팀 우선, Phase별 재구성 허용
- incremental QA 필수 (매트릭스 지정 Phase)
- 모든 공유 데이터는 `_workspace/` 경유, 최종 산출물은 ARCHITECTURE.md 경로로
- TASKS.md는 진행상황의 단일 진실의 원천
- 실패 시 누락 명시 — 조용히 건너뛰지 않음
- 모든 Agent 호출에 `model: "opus"`

## 참고

- 프로젝트 문서: `CLAUDE.md`, `PRD.md`, `ARCHITECTURE.md`, `TASKS.md`, `REFERENCE.md`
- 에이전트: `.claude/agents/` (5개)
- 스킬: `supabase-migration-rules`, `chrome-extension-security`, `seo-analyzer-rules`, `boundary-qa`, `legacy-port-guide`
