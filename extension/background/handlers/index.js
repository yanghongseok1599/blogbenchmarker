// background/handlers/index.js
// 모든 메시지 핸들러를 import → 액션 라우팅 맵(routes)으로 통합해 export.
// service-worker.js 는 이 맵 하나만 import 하면 되며, 신규 도메인 추가 시 이 파일에만 항목을 추가한다.
//
// 액션 네임스페이스 규칙: "{domain}.{action}"
//   - auth.*       인증/세션 (Phase 2.2 구현)
//   - analyze.*    SEO 분석   (Phase 2.3+ 예정)
//   - generate.*   AI 글 생성 (Phase 3.x 예정)
//   - benchmark.*  벤치마킹   (Phase 4.x 예정)
//   - usage.*      사용량     (Phase 3.x 예정)

import { authHandler } from './auth-handler.js'
import { benchmarkHandler } from './benchmark-handler.js'
import { generateHandler } from './generate-handler.js'
import { learningHandler } from './learning-handler.js'
import { pomodoroHandler } from './pomodoro-handler.js'
import { analyzeHandler } from './analyze-handler.js'
import { ensureBenchmarkAlarm } from '../schedulers/benchmark-sync.js'

/**
 * 액션명 → 비동기 핸들러 함수.
 * 핸들러 시그니처: `(payload, sender) => Promise<any>`.
 * 반환값은 router 가 `{ ok: true, data }` 로 감싸 sendResponse 로 전달한다.
 * 예외는 router 가 `{ ok: false, error: e.message }` 로 매핑한다.
 *
 * @type {Readonly<Record<string, (payload: any, sender: chrome.runtime.MessageSender) => Promise<any>>>}
 */
export const routes = Object.freeze({
  'analyze.post':            (payload) => analyzeHandler.post(payload),
  'auth.login':              (payload) => authHandler.login(payload),
  'auth.signup':             (payload) => authHandler.signup(payload),
  'auth.logout':             ()        => authHandler.logout(),
  'auth.resetPassword':      (payload) => authHandler.resetPassword(payload),
  'auth.getSession':         ()        => authHandler.getSession(),
  'auth.onAuthChange':       ()        => authHandler.onAuthChange(),
  'benchmark.addBlog':       (payload) => benchmarkHandler.addBlog(payload),
  'benchmark.removeBlog':    (payload) => benchmarkHandler.removeBlog(payload),
  'benchmark.listBlogs':     (payload) => benchmarkHandler.listBlogs(payload),
  'benchmark.syncBlogPosts': (payload) => benchmarkHandler.syncBlogPosts(payload),
  'generate.content':        (payload) => generateHandler.content(payload),
  'learning.save':           (payload) => learningHandler.save(payload),
  'tools.pomodoro.getState': ()        => pomodoroHandler.getState(),
  'tools.pomodoro.start':    (payload) => pomodoroHandler.start(payload),
  'tools.pomodoro.pause':    ()        => pomodoroHandler.pause(),
  'tools.pomodoro.resume':   ()        => pomodoroHandler.resume(),
  'tools.pomodoro.reset':    ()        => pomodoroHandler.reset(),
})

/**
 * SW 부팅 시 1회 실행되는 초기화 훅 목록.
 * 여기에 등록된 async 함수는 service-worker.js 가 import 후 병렬 실행한다.
 * 실패해도 서비스 워커는 계속 살아있어야 하므로 각자 catch 필수.
 * @type {ReadonlyArray<() => Promise<void>>}
 */
export const bootTasks = Object.freeze([
  async () => {
    // 인증 상태 변화 브로드캐스트 구독 — 모든 확장 페이지가 개별 호출하지 않아도 되도록 선 구독.
    await authHandler.onAuthChange()
  },
  async () => {
    // 벤치마킹 주기 동기화 알람 등록 (idempotent — 이미 있으면 no-op).
    await ensureBenchmarkAlarm()
  },
])
