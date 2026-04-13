// extension/background/handlers/pomodoro-handler.js
// 뽀모도로 타이머의 상태를 service worker 가 관리한다.
// sidepanel 이 닫혀도 chrome.alarms + chrome.storage.local 로 상태가 유지된다.
//
// 상태 shape (chrome.storage.local.__pomodoro_state):
//   {
//     status: 'idle' | 'running' | 'paused',
//     phase:  'idle' | 'work' | 'break',
//     startedAt: number | null,           // ms since epoch
//     plannedEndAt: number | null,        // ms, running 일 때만
//     pausedRemainingMs: number | null,   // paused 일 때만
//     cycle: number,                      // 완료한 work 세션 수
//     settings: { workMinutes, breakMinutes }
//   }
//
// 모듈 top-level 에서 chrome.alarms.onAlarm 리스너를 등록한다. SW 재시작 시
// index.js 가 본 모듈을 import 하면서 리스너가 재등록된다(이전 lifecycle 리스너는 소멸).

const STATE_KEY = '__pomodoro_state'
const ALARM_NAME = 'bbm.pomodoro.tick'
const NOTIF_WORK_DONE = 'bbm.pomodoro.work-done'
const NOTIF_BREAK_DONE = 'bbm.pomodoro.break-done'

const DEFAULT_WORK_MIN = 25
const DEFAULT_BREAK_MIN = 5

function defaultState() {
  return {
    status: 'idle',
    phase: 'idle',
    startedAt: null,
    plannedEndAt: null,
    pausedRemainingMs: null,
    cycle: 0,
    settings: { workMinutes: DEFAULT_WORK_MIN, breakMinutes: DEFAULT_BREAK_MIN },
  }
}

async function getStoredState() {
  try {
    const res = await chrome.storage.local.get([STATE_KEY])
    const s = res?.[STATE_KEY]
    return s && typeof s === 'object' ? { ...defaultState(), ...s, settings: { ...defaultState().settings, ...(s.settings || {}) } } : defaultState()
  } catch (_) {
    return defaultState()
  }
}

async function writeState(state) {
  await chrome.storage.local.set({ [STATE_KEY]: state })
}

function clampMinutes(v, fallback) {
  const n = Number(v)
  if (!Number.isFinite(n) || n <= 0 || n > 180) return fallback
  return Math.floor(n)
}

async function showNotification(id, title, message) {
  if (!chrome.notifications?.create) return
  try {
    await chrome.notifications.create(id, {
      type: 'basic',
      title,
      message,
      iconUrl: chrome.runtime.getURL('icons/icon128.png'),
      priority: 2,
    })
  } catch (_) { /* notification 실패는 타이머 동작을 막지 않는다 */ }
}

/** 현재 상태 조회. UI 가 getState 로 1초 폴링하거나 storage 이벤트 구독. */
async function getState() {
  const s = await getStoredState()
  if (s.status === 'running' && Number.isFinite(s.plannedEndAt)) {
    s.remainingMs = Math.max(0, s.plannedEndAt - Date.now())
  } else if (s.status === 'paused' && Number.isFinite(s.pausedRemainingMs)) {
    s.remainingMs = Math.max(0, s.pausedRemainingMs)
  } else {
    s.remainingMs = 0
  }
  return s
}

async function start(payload) {
  const workMinutes = clampMinutes(payload?.workMinutes, DEFAULT_WORK_MIN)
  const breakMinutes = clampMinutes(payload?.breakMinutes, DEFAULT_BREAK_MIN)
  const now = Date.now()
  const plannedEndAt = now + workMinutes * 60 * 1000

  const state = {
    ...defaultState(),
    status: 'running',
    phase: 'work',
    startedAt: now,
    plannedEndAt,
    pausedRemainingMs: null,
    cycle: 0,
    settings: { workMinutes, breakMinutes },
  }

  await writeState(state)
  // chrome.alarms 의 최소 `delayInMinutes` 는 30초(배포 환경). 여기선 `when` 으로 절대시간 지정.
  await chrome.alarms.create(ALARM_NAME, { when: plannedEndAt })
  return { ...state, remainingMs: plannedEndAt - now }
}

async function pause() {
  const s = await getStoredState()
  if (s.status !== 'running' || !Number.isFinite(s.plannedEndAt)) return getState()
  const remaining = Math.max(0, s.plannedEndAt - Date.now())
  const next = {
    ...s,
    status: 'paused',
    pausedRemainingMs: remaining,
    plannedEndAt: null,
  }
  await writeState(next)
  try { await chrome.alarms.clear(ALARM_NAME) } catch (_) { /* noop */ }
  return { ...next, remainingMs: remaining }
}

async function resume() {
  const s = await getStoredState()
  if (s.status !== 'paused' || !Number.isFinite(s.pausedRemainingMs) || s.pausedRemainingMs <= 0) {
    return getState()
  }
  const now = Date.now()
  const plannedEndAt = now + s.pausedRemainingMs
  const next = {
    ...s,
    status: 'running',
    startedAt: now,
    plannedEndAt,
    pausedRemainingMs: null,
  }
  await writeState(next)
  await chrome.alarms.create(ALARM_NAME, { when: plannedEndAt })
  return { ...next, remainingMs: plannedEndAt - now }
}

async function reset() {
  try { await chrome.alarms.clear(ALARM_NAME) } catch (_) { /* noop */ }
  const next = defaultState()
  await writeState(next)
  return { ...next, remainingMs: 0 }
}

/** phase 전이 (alarm 발화 시 호출). */
async function onAlarmFired() {
  const s = await getStoredState()
  if (s.status !== 'running') return

  if (s.phase === 'work') {
    const now = Date.now()
    const plannedEndAt = now + s.settings.breakMinutes * 60 * 1000
    const next = {
      ...s,
      phase: 'break',
      startedAt: now,
      plannedEndAt,
      cycle: s.cycle + 1,
    }
    await writeState(next)
    await chrome.alarms.create(ALARM_NAME, { when: plannedEndAt })
    await showNotification(NOTIF_WORK_DONE, '뽀모도로 — 작업 완료', `${s.settings.workMinutes}분 작업 완료! ${s.settings.breakMinutes}분 휴식하세요.`)
    return
  }

  if (s.phase === 'break') {
    // 세션 종료 — 사용자가 다시 start 하도록 idle 상태로 전환.
    const next = { ...defaultState(), cycle: s.cycle, settings: s.settings }
    await writeState(next)
    try { await chrome.alarms.clear(ALARM_NAME) } catch (_) { /* noop */ }
    await showNotification(NOTIF_BREAK_DONE, '뽀모도로 — 휴식 완료', '다음 세션을 시작할 준비가 됐어요.')
    return
  }
}

// 전역 리스너(top-level) — 본 모듈이 import 되면 자동 등록.
// 다른 알람(benchmark 등)은 본 조건문으로 걸러 서로 간섭하지 않는다.
if (chrome.alarms?.onAlarm) {
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm?.name !== ALARM_NAME) return
    onAlarmFired().catch((e) => console.warn('[pomodoro] alarm fire failed:', e?.message))
  })
}

export const pomodoroHandler = Object.freeze({
  getState,
  start,
  pause,
  resume,
  reset,
})

export const POMODORO_ALARM_NAME = ALARM_NAME
export const POMODORO_STATE_KEY = STATE_KEY
