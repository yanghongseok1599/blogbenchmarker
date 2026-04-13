// extension/sidepanel/tools/pomodoro.js
// 뽀모도로 타이머 UI. 상태는 service worker(pomodoro-handler)가 관리한다.
// sidepanel 이 닫혀도 타이머는 background 에서 진행된다.
//
// 통신: chrome.runtime.sendMessage({ action: 'tools.pomodoro.*' })
// 실시간 갱신: 1초 간격 local tick + chrome.storage.onChanged 이벤트.

import { createEl, safeText, clearAndAppend } from '../../lib/dom-safe.js'

const ACTIONS = Object.freeze({
  GET: 'tools.pomodoro.getState',
  START: 'tools.pomodoro.start',
  PAUSE: 'tools.pomodoro.pause',
  RESUME: 'tools.pomodoro.resume',
  RESET: 'tools.pomodoro.reset',
})
const STATE_KEY = '__pomodoro_state'

function formatTime(ms) {
  const s = Math.max(0, Math.ceil((ms || 0) / 1000))
  const mm = String(Math.floor(s / 60)).padStart(2, '0')
  const ss = String(s % 60).padStart(2, '0')
  return `${mm}:${ss}`
}

async function send(action, payload) {
  const res = await chrome.runtime.sendMessage({ action, payload })
  if (!res || res.ok !== true) {
    throw new Error(res?.error || `${action} 실패`)
  }
  return res.data
}

/**
 * 타이머 카드 컴포넌트.
 * @returns {HTMLElement}
 */
export function createPomodoroCard() {
  const root = createEl('section', {
    className: 'bm-tool bm-pomo',
    'aria-label': '뽀모도로 타이머',
  })

  // 헤더
  root.appendChild(
    createEl('header', { className: 'bm-tool__head' }, [
      createEl('h3', { className: 'bm-tool__title' }, '뽀모도로 타이머'),
      createEl('p', { className: 'bm-tool__hint' }, '집중 시간과 휴식 시간을 번갈아 관리합니다. 창을 닫아도 계속 진행됩니다.'),
    ]),
  )

  // 시간 표시
  const timeEl = createEl('p', { className: 'bm-pomo__time', 'aria-live': 'polite' }, '25:00')
  const phaseEl = createEl('p', { className: 'bm-pomo__phase' }, '대기 중')
  const cycleEl = createEl('p', { className: 'bm-pomo__cycle' }, '완료 0 세션')
  root.appendChild(
    createEl('div', { className: 'bm-pomo__display' }, [timeEl, phaseEl, cycleEl]),
  )

  // 설정 (작업/휴식 분)
  const workInput = createEl('input', {
    type: 'number', min: '1', max: '180', value: '25',
    className: 'bm-pomo__num', id: 'bm-pomo-work',
  })
  const breakInput = createEl('input', {
    type: 'number', min: '1', max: '60', value: '5',
    className: 'bm-pomo__num', id: 'bm-pomo-break',
  })
  const settings = createEl('div', { className: 'bm-pomo__settings' }, [
    createEl('label', { for: 'bm-pomo-work' }, ['작업(분) ', workInput]),
    createEl('label', { for: 'bm-pomo-break' }, ['휴식(분) ', breakInput]),
  ])
  root.appendChild(settings)

  // 버튼
  const startBtn = createEl('button', {
    type: 'button', className: 'bm-btn bm-btn--primary', id: 'bm-pomo-start',
  }, '시작')
  const pauseBtn = createEl('button', {
    type: 'button', className: 'bm-btn', id: 'bm-pomo-pause',
  }, '일시정지')
  const resetBtn = createEl('button', {
    type: 'button', className: 'bm-btn', id: 'bm-pomo-reset',
  }, '리셋')
  const actions = createEl('div', { className: 'bm-tool__actions' }, [startBtn, pauseBtn, resetBtn])
  root.appendChild(actions)

  const errEl = createEl('p', { className: 'bm-pomo__error', role: 'alert', hidden: '' })
  root.appendChild(errEl)

  function setError(text) {
    if (!text) {
      errEl.setAttribute('hidden', '')
      safeText(errEl, '')
      return
    }
    errEl.removeAttribute('hidden')
    safeText(errEl, text)
  }

  let lastState = null
  let localTickTimer = null

  function renderState(state) {
    lastState = state
    setError(null)
    const phaseLabels = { idle: '대기 중', work: '집중', break: '휴식' }
    safeText(phaseEl, phaseLabels[state.phase] || state.phase)
    safeText(cycleEl, `완료 ${state.cycle || 0} 세션`)

    let ms = state.remainingMs
    if (state.status === 'running' && Number.isFinite(state.plannedEndAt)) {
      ms = Math.max(0, state.plannedEndAt - Date.now())
    } else if (state.status === 'paused' && Number.isFinite(state.pausedRemainingMs)) {
      ms = state.pausedRemainingMs
    } else if (!Number.isFinite(ms)) {
      const work = Number(workInput.value) || 25
      ms = work * 60 * 1000
    }
    safeText(timeEl, formatTime(ms))

    // 버튼 활성 상태
    startBtn.disabled = state.status === 'running'
    pauseBtn.disabled = state.status !== 'running' && state.status !== 'paused'
    safeText(pauseBtn, state.status === 'paused' ? '재개' : '일시정지')
    resetBtn.disabled = state.status === 'idle' && (state.cycle || 0) === 0
  }

  function tickLocal() {
    if (!lastState || lastState.status !== 'running') return
    const ms = Math.max(0, (lastState.plannedEndAt || 0) - Date.now())
    safeText(timeEl, formatTime(ms))
  }

  async function refresh() {
    try {
      const s = await send(ACTIONS.GET)
      renderState(s)
    } catch (err) {
      setError('상태를 불러올 수 없습니다.')
      console.warn('[pomodoro] getState failed')
    }
  }

  startBtn.addEventListener('click', async () => {
    try {
      const s = await send(ACTIONS.START, {
        workMinutes: Number(workInput.value) || 25,
        breakMinutes: Number(breakInput.value) || 5,
      })
      renderState(s)
    } catch (err) { setError('시작에 실패했습니다.') }
  })
  pauseBtn.addEventListener('click', async () => {
    try {
      const action = lastState?.status === 'paused' ? ACTIONS.RESUME : ACTIONS.PAUSE
      const s = await send(action)
      renderState(s)
    } catch (err) { setError('일시정지/재개에 실패했습니다.') }
  })
  resetBtn.addEventListener('click', async () => {
    try {
      const s = await send(ACTIONS.RESET)
      renderState(s)
    } catch (err) { setError('리셋에 실패했습니다.') }
  })

  // chrome.storage 이벤트로 phase 전이 감지(알람 발화 후 background 가 state 갱신).
  const onStorageChanged = (changes, area) => {
    if (area !== 'local' || !changes?.[STATE_KEY]) return
    refresh()
  }
  chrome.storage.onChanged.addListener(onStorageChanged)

  // 1초 로컬 틱(running 중일 때만 화면 시간만 갱신 — 상태 자체는 background 가 정답).
  localTickTimer = setInterval(tickLocal, 1000)

  // 초기 렌더
  refresh()

  // 정리 함수
  root._destroy = () => {
    try { chrome.storage.onChanged.removeListener(onStorageChanged) } catch (_) {}
    if (localTickTimer) clearInterval(localTickTimer)
  }

  return root
}

/** 카드 파괴 시 내부 타이머/리스너 정리. */
export function destroyPomodoroCard(root) {
  if (root && typeof root._destroy === 'function') {
    try { root._destroy() } catch (_) { /* noop */ }
  }
}
