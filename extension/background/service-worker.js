// background/service-worker.js
// 메시지 라우터 — handlers/index.js 의 routes 맵에 액션 디스패치한다.
// 원칙:
//   - 동일 확장 컨텍스트(chrome.runtime.id) 의 메시지만 수신 (sender 검증)
//   - 비동기 sendResponse 는 반드시 `return true` (누락 시 응답 유실)
//   - 모듈 스코프 상태 최소화 — SW 는 idle 시 재시작된다

import { routes, bootTasks } from './handlers/index.js'

/**
 * 메시지 sender 가 신뢰 가능한 확장 내부 컨텍스트인지 검증.
 * 외부 웹페이지가 externally_connectable 없이 postMessage 할 수는 없으나,
 * 방어적으로 확장 ID 를 한 번 더 확인한다.
 * @param {chrome.runtime.MessageSender | undefined} sender
 */
function isTrustedSender(sender) {
  if (!sender) return false
  if (sender.id && sender.id !== chrome.runtime.id) return false
  // content script(sender.tab 존재) 혹은 확장 페이지(sender.url = chrome-extension://...) 모두 허용.
  if (sender.url) {
    const extensionOrigin = chrome.runtime.getURL('')
    // 확장 페이지면 origin 일치, content script 면 https://*.naver.com/*
    const isExtensionPage = sender.url.startsWith(extensionOrigin)
    const isAllowedHost = /^https?:\/\/([a-z0-9-]+\.)*naver\.com\//i.test(sender.url)
    if (!isExtensionPage && !isAllowedHost && !sender.tab) return false
  }
  return true
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!isTrustedSender(sender)) {
    sendResponse({ ok: false, error: 'Untrusted sender' })
    return false
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

  // 비동기 응답 보존 — 누락 시 Chrome 이 응답 포트를 즉시 닫는다.
  return true
})

// 설치 시 사이드패널 동작 설정.
chrome.runtime.onInstalled.addListener(() => {
  if (chrome.sidePanel?.setPanelBehavior) {
    chrome.sidePanel
      .setPanelBehavior({ openPanelOnActionClick: true })
      .catch(() => { /* 일부 환경 미지원 무시 */ })
  }
})

// SW 부팅 시 1회 초기화 훅 실행 (예: auth 상태 브로드캐스트 구독).
// 각 훅은 자체적으로 에러를 삼키지만, 외부에서도 한 번 더 방어한다.
for (const task of bootTasks) {
  Promise.resolve()
    .then(() => task())
    .catch((e) => console.warn('[service-worker] boot task 실패', e?.message))
}
