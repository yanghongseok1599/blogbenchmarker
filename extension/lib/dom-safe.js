// dom-safe.js
// XSS 방지 DOM 헬퍼. 모든 UI 코드는 이 모듈을 경유해 DOM 을 조작한다.
//
// 규칙 (chrome-extension-security §3):
//   - innerHTML / outerHTML / insertAdjacentHTML 사용 전면 금지
//   - 사용자/외부(네이버 블로그) 유래 문자열은 항상 textContent 로만 삽입
//   - HTML 구조는 createElement + appendChild 체이닝으로 구성
//
// 이 파일 내부에서도 innerHTML 은 절대 사용하지 않는다. 검증: grep -n "innerHTML" lib/dom-safe.js → 0건.

/**
 * 엘리먼트의 텍스트를 안전하게 교체한다.
 * textContent 는 HTML 을 파싱하지 않으므로 `<script>` 문자열도 평문으로 남는다.
 * @param {Element} element 대상 엘리먼트
 * @param {string | number | null | undefined} text 삽입할 값. null/undefined 는 빈 문자열로 처리
 * @returns {Element} 체이닝용으로 동일 엘리먼트 반환
 */
export function safeText(element, text) {
  if (!element || typeof element.textContent === 'undefined') {
    throw new TypeError('safeText: 유효한 Element 가 필요합니다.')
  }
  element.textContent = text == null ? '' : String(text)
  return element
}

/**
 * 이벤트 리스너 attrs 키 접두어.
 * 예: { onClick: fn } → addEventListener('click', fn).
 */
const EVENT_ATTR_PREFIX = 'on'

/**
 * attrs 한 쌍을 엘리먼트에 적용한다.
 * - className: 그대로 className 에 할당
 * - style:     객체면 Object.assign, 문자열이면 setAttribute
 * - onX:       addEventListener('x', handler) 등록
 * - dataset.*: data-* 속성으로 매핑 ({ 'data-id': 'abc' } 형식 권장)
 * - 그 외:     setAttribute 로 설정 (값이 null/false 면 제거)
 * @param {Element} node
 * @param {string} key
 * @param {unknown} value
 */
function applyAttr(node, key, value) {
  if (value == null || value === false) {
    node.removeAttribute(key)
    return
  }
  if (key === 'className') {
    node.className = String(value)
    return
  }
  if (key === 'style' && typeof value === 'object') {
    Object.assign(/** @type {HTMLElement} */ (node).style, value)
    return
  }
  if (key.startsWith(EVENT_ATTR_PREFIX) && typeof value === 'function') {
    const eventName = key.slice(EVENT_ATTR_PREFIX.length).toLowerCase()
    node.addEventListener(eventName, /** @type {EventListener} */ (value))
    return
  }
  node.setAttribute(key, String(value))
}

/**
 * 자식 인자를 노드/텍스트로 정규화해 부모에 붙인다.
 * 문자열/숫자는 TextNode 로 변환되므로 HTML 로 해석되지 않는다.
 * @param {Node} parent
 * @param {unknown} child
 */
function appendChildSafe(parent, child) {
  if (child == null || child === false) return
  if (Array.isArray(child)) {
    for (const c of child) appendChildSafe(parent, c)
    return
  }
  if (child instanceof Node) {
    parent.appendChild(child)
    return
  }
  parent.appendChild(document.createTextNode(String(child)))
}

/**
 * 안전한 createElement 래퍼.
 * @param {string} tag HTML 태그명. 'script' 는 금지한다(동적 스크립트 주입 차단).
 * @param {Record<string, unknown>} [attrs] 속성/이벤트 맵
 * @param {Array<unknown> | unknown} [children] 자식 노드 또는 문자열 배열
 * @returns {HTMLElement}
 */
export function createEl(tag, attrs = {}, children = []) {
  const lowered = String(tag).toLowerCase()
  if (lowered === 'script') {
    throw new Error('createEl: script 태그 생성 금지 (CSP script-src self 위반)')
  }
  const node = document.createElement(lowered)
  for (const [k, v] of Object.entries(attrs || {})) {
    applyAttr(node, k, v)
  }
  const list = Array.isArray(children) ? children : [children]
  for (const c of list) appendChildSafe(node, c)
  return node
}

/**
 * 부모의 모든 자식을 제거한 뒤 새 자식들을 붙인다.
 * innerHTML = '' 대체용.
 * @param {Node} parent
 * @param  {...unknown} children
 * @returns {Node} 부모 노드(체이닝)
 */
export function clearAndAppend(parent, ...children) {
  if (!parent) throw new TypeError('clearAndAppend: parent 필요')
  while (parent.firstChild) parent.removeChild(parent.firstChild)
  for (const c of children) appendChildSafe(parent, c)
  return parent
}

/**
 * HTML 특수문자 이스케이프. 최후의 수단 — 가급적 safeText / createEl 을 먼저 쓴다.
 * textarea 트릭을 쓰지 않는 이유: 일부 SSR/unit 테스트 환경에 DOM 이 없어도 동작해야 함.
 * @param {string | number | null | undefined} value
 * @returns {string} 이스케이프된 문자열
 */
export function escapeHtml(value) {
  if (value == null) return ''
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/\//g, '&#x2F;')
    .replace(/`/g, '&#x60;')
}
