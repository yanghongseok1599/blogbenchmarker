# BLOG BenchMarker — 빌드 & 배포 가이드

프로덕션 zip 을 만들고 Chrome Web Store 에 제출하는 절차를 정리한 문서입니다.

## 요구 환경

- macOS 또는 Linux (빌드 스크립트가 Bash 4+, rsync, zip 전제)
- Node.js ≥ 18 (strip-console.js 실행 + manifest version 동기화)
- Supabase CLI (Edge Function 배포 시만)

> Windows 는 WSL 사용 권장. 네이티브 Windows 는 미지원.

## 디렉토리 구조 (빌드 산출물)

```
dist/
├── extension/                         # Chrome 이 로드하는 실제 번들
│   ├── manifest.json                  # version = package.json.version 으로 동기화됨
│   ├── background/
│   ├── sidepanel/
│   ├── lib/
│   │   ├── env-config.example.js      # 템플릿만 포함 (실제 키 파일은 제외)
│   │   └── ...
│   └── icons/
└── blogbenchmarker-{version}.zip      # Chrome Web Store 제출용
```

## 빠른 시작

```bash
# 1) 의존성 확인 (Node만 있으면 충분)
node --version    # v18+

# 2) 전체 파이프라인 (빌드 → 검증)
npm run all

# 또는 단계별
npm run build     # dist/ 생성 + zip 패키징
npm run verify    # 검증 (console 잔존, innerHTML, 시크릿 등)
```

## 스크립트 목록

| 스크립트 | 역할 |
|---|---|
| `npm run build` | `scripts/build.sh` — 정리 → 복사 → strip-console → 버전 동기화 → zip |
| `npm run package` | `scripts/package-extension.sh` — dist/extension → zip (재패키징 용) |
| `npm run strip-console` | `node scripts/strip-console.js` — 특정 경로에 수동 적용 |
| `npm run verify` | `scripts/verify-build.sh` — 빌드 산출물 검증 |
| `npm run all` | build + verify |

### 환경변수

- `STRIP_CONSOLE_DRY=1` — `strip-console.js` 를 dry-run (파일 수정 없이 로그만)
  ```bash
  STRIP_CONSOLE_DRY=1 node scripts/strip-console.js dist/extension
  ```

## 빌드 단계 상세

1. **dist/ 정리** — 이전 산출물 완전 제거 (`rm -rf dist`).
2. **복사** — `rsync -a` 로 `extension/` → `dist/extension/`. 제외 대상:
   - `lib/env-config.js` (비밀 키 포함, `.gitignore` 대상)
   - `.DS_Store`, `*.map`, `*.md`, `*.log`, `__tests__/`, `node_modules/`
3. **strip-console** — `console.log | warn | info | debug | trace` 호출 제거.
   - `console.error` 는 **유지** (프로덕션 장애 감시).
   - 주석 안의 console 문자열은 보존.
   - 정규식 기반(AST 미사용) — 체이닝(`.then/.catch`) 감지 시 보수적으로 건너뜀.
4. **manifest 버전 동기화** — `package.json.version` → `dist/extension/manifest.json.version`.
5. **zip** — `zip -r -X -9` 로 최대 압축 + 확장 속성 제거.
   - 파일 권한 600 (소유자만 읽기/쓰기).
6. **요약 출력** — 파일 수, 총 크기, zip 크기.

## 검증 항목 (verify-build.sh)

| 항목 | 실패 시 의미 |
|---|---|
| (A) 필수 파일 존재 | manifest / service-worker / sidepanel 등 누락 — 빌드 제외 룰 과잉 |
| (B) env-config.js 미포함 | 실제 키 파일이 zip 에 포함 — 비밀값 유출 위험 (BLOCKER) |
| (C) console.log/warn/info/debug/trace 0건 | strip-console 실패 또는 신규 파일이 처리되지 않음 |
| (D) manifest.version == package.version | 릴리스 태그와 실제 배포본 불일치 |
| (E) 시크릿 하드코딩 0건 | Gemini 키·서비스롤·webhook secret 등 유출 (BLOCKER) |
| (F) innerHTML 할당 0건 | XSS 경로 (BLOCKER — dom-safe 헬퍼로 교체 필요) |

## 릴리스 체크리스트

### 🟢 빌드 전

- [ ] `CLAUDE.md` / `TASKS.md` 상 Phase 가 모두 `[done]` 마킹
- [ ] QA 리포트 (`_workspace/qa_report_*.md`) 의 BLOCKER 0건
- [ ] `extension/manifest.json` 의 `permissions`, `host_permissions` 점검 — 과다 권한은 심사 반려 사유
- [ ] `extension/icons/` 에 `icon16.png`, `icon48.png`, `icon128.png` 실제 파일 존재 (placeholder 아님)
- [ ] `package.json` 의 `version` 을 릴리스 버전으로 bump (SemVer)
- [ ] `supabase` 프로젝트 프로덕션 Secrets 설정:
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `GEMINI_API_KEY`
  - `TOSS_SECRET_KEY`, `TOSS_WEBHOOK_SECRET`
  - `PORTONE_API_SECRET`, `PORTONE_WEBHOOK_SECRET` (활성 시)
- [ ] `supabase db push` 로 migrations 001~008 모두 반영
- [ ] `supabase functions deploy generate-content extract-youtube verify-subscription admin-actions`

### 🟡 빌드

```bash
npm run build
```

### 🟠 검증

```bash
npm run verify
```

모든 항목이 `✓` 로 표시되어야 함. 하나라도 실패 시 수정 후 재빌드.

### 🔵 로컬 테스트

1. Chrome → `chrome://extensions/` → "압축해제된 확장프로그램 로드" → `dist/extension/` 선택.
2. 다음 시나리오 확인:
   - 로그인/로그아웃 (자동 재로그인 안 됨)
   - 네이버 블로그 글 분석
   - 벤치마크 블로그 추가/삭제 (Realtime 반영)
   - AI 글 생성 (쿼터 차감 확인)
   - 마이페이지 사용량 표시
   - 결제 플로우 (토스 테스트 결제 키로)
3. `chrome://extensions/` 우측 상단 "서비스 워커" 콘솔에서 에러 0건 확인.

### 🟣 Chrome Web Store 업로드

1. [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole) 접속.
2. "새 항목" → `dist/blogbenchmarker-{version}.zip` 업로드.
3. Store 정보 탭 — 스크린샷(1280×800, 최소 1장), 프로모션 타일, 소개 문구 한/영/일 작성.
4. Privacy practices 탭 — 수집하는 데이터 항목 체크(email, 블로그 URL 등), 목적, 타사 공유 여부.
5. 권한 정당화:
   - `storage` — 세션 저장, 로컬 캐시
   - `sidePanel` — 메인 UI 진입점
   - `scripting` — 네이버 블로그 글 추출
   - `tabs` — 현재 탭 URL 확인 및 결제 랜딩 오픈
   - `alarms` — 주기적 벤치마크 동기화
   - `notifications` — 구독 만료 알림
   - `host_permissions: blog.naver.com` — SEO 분석 및 벤치마킹 대상
6. "심사 제출" — 심사 기간 보통 1~3 영업일.

### 🔴 심사 후

- 심사 통과 → 자동 배포됨. 기존 사용자는 다음 Chrome 자동 업데이트 주기에 반영.
- 반려 시 이메일 사유 확인 → 수정 → `version` bump → 재빌드 → 재제출.

## 롤백 절차

1. Developer Dashboard 에서 이전 버전 zip 재업로드.
2. `version` 은 이전 버전보다 **더 높아야** 함 (예: 1.0.5 → 롤백 시 1.0.6 으로 이전 코드 재배포).
3. 서버 측(Edge Function / migrations) 도 필요 시 이전 커밋으로 redeploy.

## 자주 묻는 문제

### Q. strip-console 이 내 신규 `console.log` 를 제거하지 못합니다.
A. 체이닝이 뒤에 붙어있으면 보수적으로 건너뜁니다. 예: `console.log(x).then(...)`. 이런 코드는 프로덕션에 넣지 마세요. 정기 삭제 대상이 아닙니다.

### Q. console.error 도 제거하고 싶습니다.
A. `scripts/strip-console.js` 의 `STRIPPED_METHODS` 배열에 `'error'` 를 추가. 다만 장애 추적이 어려워지므로 권장하지 않습니다.

### Q. zip 에 `__MACOSX/` 폴더가 들어갑니다.
A. `zip -X` 옵션으로 제외되어야 합니다. 그래도 들어간다면 `ditto -c -k --sequesterRsrc --keepParent` 로 교체 가능.

### Q. "extension/lib/env-config.js 가 포함됨" 에러가 납니다.
A. `.gitignore` 와 별개로 rsync 의 `--exclude='lib/env-config.js'` 룰이 적용됐는지 확인. 경로가 맞지 않으면 제외되지 않습니다.

## 참고 스크립트

- 빌드 파이프라인: `scripts/build.sh`
- 패키징: `scripts/package-extension.sh`
- console 제거: `scripts/strip-console.js`
- 검증: `scripts/verify-build.sh`
- 보안 QA 스크립트: `_workspace/qa-scripts/` (build 와 별개로 소스 기준 검사)
