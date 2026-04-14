// background/service-worker.js
// 메시지 라우터 — handlers/index.js 의 routes 맵에 액션 디스패치한다.
// 원칙:
//   - 동일 확장 컨텍스트(chrome.runtime.id) 의 메시지만 수신 (sender 검증)
//   - 비동기 sendResponse 는 반드시 `return true` (누락 시 응답 유실)
//   - 모듈 스코프 상태 최소화 — SW 는 idle 시 재시작된다
//
// 실행 모드: **classic service worker** (manifest.json 에서 type:"module" 제거).
// 이유: @supabase/supabase-js UMD 번들은 `var supabase=...` 형태라 ESM import 시
//       globalThis 에 붙지 않는다. classic SW 로 importScripts 를 사용하면 UMD 의
//       top-level var 가 globalThis 에 직접 붙는다. 핸들러/스케줄러는 ESM 유지하되
//       **dynamic import()** 로 로드한다 (classic SW 도 dynamic import 지원).

// 1) Supabase UMD 번들을 최우선 로드 → globalThis.supabase.createClient 확보
try {
  importScripts('../lib/vendor/supabase.umd.min.js')
} catch (e) {
  console.error('[service-worker] Supabase UMD importScripts 실패:', e?.message || e)
}

// 2) 메시지 핸들러는 ESM 이므로 dynamic import 로 로드.
//    라우트 맵이 준비될 때까지 들어오는 메시지는 지연 큐에 적재 후 flush.
let routes = null
let bootTasks = []
let ensureBenchmarkAlarm = async () => {}
let handleBenchmarkAlarm = async () => {}
let BENCHMARK_ALARM_NAME = 'benchmark-sync'

const pendingMessages = []

async function bootstrap() {
  const handlersMod = await import(chrome.runtime.getURL('background/handlers/index.js'))
  const schedulerMod = await import(chrome.runtime.getURL('background/schedulers/benchmark-sync.js'))
  routes = handlersMod.routes
  bootTasks = handlersMod.bootTasks || []
  ensureBenchmarkAlarm = schedulerMod.ensureBenchmarkAlarm
  handleBenchmarkAlarm = schedulerMod.handleBenchmarkAlarm
  BENCHMARK_ALARM_NAME = schedulerMod.BENCHMARK_ALARM_NAME || BENCHMARK_ALARM_NAME

  // SW 부팅 1회 초기화 훅
  for (const task of bootTasks) {
    Promise.resolve()
      .then(() => task())
      .catch((e) => console.warn('[service-worker] boot task 실패', e?.message))
  }

  // 지연된 메시지 flush
  while (pendingMessages.length) {
    const { msg, sender, sendResponse } = pendingMessages.shift()
    dispatchMessage(msg, sender, sendResponse)
  }
}

bootstrap().catch((e) => {
  console.error('[service-worker] bootstrap 실패:', e?.message || e, e?.stack)
})

/**
 * 메시지 sender 가 신뢰 가능한 확장 내부 컨텍스트인지 검증.
 * @param {chrome.runtime.MessageSender | undefined} sender
 */
function isTrustedSender(sender) {
  if (!sender) return false
  if (sender.id && sender.id !== chrome.runtime.id) return false
  if (sender.url) {
    const extensionOrigin = chrome.runtime.getURL('')
    const isExtensionPage = sender.url.startsWith(extensionOrigin)
    const isAllowedHost = /^https?:\/\/([a-z0-9-]+\.)*naver\.com\//i.test(sender.url)
    if (!isExtensionPage && !isAllowedHost && !sender.tab) return false
  }
  return true
}

function dispatchMessage(msg, sender, sendResponse) {
  if (!routes) {
    pendingMessages.push({ msg, sender, sendResponse })
    return true
  }
  const action = msg?.action
  const handler = action ? routes[action] : null
  if (!handler) {
    sendResponse({ ok: false, error: `Unknown action: ${action ?? '(none)'}` })
    return false
  }
  Promise.resolve(handler(msg.payload ?? {}, sender))
    .then((data) => sendResponse({ ok: true, data }))
    .catch((e) => sendResponse({ ok: false, error: e?.message ?? String(e) }))
  return true
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!isTrustedSender(sender)) {
    sendResponse({ ok: false, error: 'Untrusted sender' })
    return false
  }
  return dispatchMessage(msg, sender, sendResponse)
})

// 설치 시 사이드패널 동작 설정 + 벤치마킹 알람 등록
chrome.runtime.onInstalled.addListener(() => {
  if (chrome.sidePanel?.setPanelBehavior) {
    chrome.sidePanel
      .setPanelBehavior({ openPanelOnActionClick: true })
      .catch(() => { /* 미지원 환경 무시 */ })
  }
  // bootstrap 이 끝난 후에 alarm 등록 (실패 시 bootstrap 완료 재시도)
  const tryEnsure = () => ensureBenchmarkAlarm().catch((e) =>
    console.warn('[service-worker] benchmark alarm 등록 실패', e?.message),
  )
  if (routes) tryEnsure()
  else bootstrap().finally(tryEnsure)
})

// 알람 발화 라우팅
if (chrome.alarms?.onAlarm) {
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm?.name === BENCHMARK_ALARM_NAME) {
      handleBenchmarkAlarm(alarm).catch((e) =>
        console.warn('[service-worker] benchmark alarm 처리 실패', e?.message),
      )
    }
  })
}
