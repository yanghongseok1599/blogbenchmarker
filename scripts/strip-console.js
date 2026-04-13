#!/usr/bin/env node
// scripts/strip-console.js
// dist/ 내 모든 .js/.mjs 파일에서 console.log / console.warn / console.info /
// console.debug / console.trace 호출을 제거한다.
// console.error 는 **유지** — 프로덕션 장애 감시에 필요하다.
//
// AST 없이 정규식 기반으로 처리. 한계:
//   - 한 줄에 여러 문장이 있고 console.log 가 마지막이 아닌 경우도 커버 (표현식 단위 치환)
//   - 여러 줄에 걸친 console.log({ ... }) 도 균형 괄호 탐색으로 처리
//   - 주석(//, /* */) 내부의 console 은 보존
//   - 문자열 리터럴 내부의 "console.log" 는 보존
//
// 사용:
//   node scripts/strip-console.js <target-dir>
//   target-dir 기본값: dist/extension
//
// 환경변수:
//   STRIP_CONSOLE_DRY=1  로그만 출력, 파일 수정 없음

'use strict'

const fs = require('fs')
const path = require('path')

const TARGET_ARG = process.argv[2]
const DEFAULT_TARGET = path.join(process.cwd(), 'dist', 'extension')
const TARGET = TARGET_ARG ? path.resolve(TARGET_ARG) : DEFAULT_TARGET
const DRY = process.env.STRIP_CONSOLE_DRY === '1'

// 제거 대상 메서드 — error 는 유지
const STRIPPED_METHODS = ['log', 'warn', 'info', 'debug', 'trace']

/** @type {{ total: number, modified: number, removals: number }} */
const stats = { total: 0, modified: 0, removals: 0 }

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      walk(full)
    } else if (entry.isFile() && /\.(js|mjs)$/.test(entry.name)) {
      processFile(full)
    }
  }
}

function processFile(filePath) {
  stats.total += 1
  const original = fs.readFileSync(filePath, 'utf8')
  const { output, removed } = stripConsoleCalls(original)
  if (removed === 0) return

  stats.modified += 1
  stats.removals += removed

  if (DRY) {
    console.log(`[dry] ${path.relative(process.cwd(), filePath)}  제거 ${removed}건`)
    return
  }
  fs.writeFileSync(filePath, output, 'utf8')
  console.log(`[strip] ${path.relative(process.cwd(), filePath)}  제거 ${removed}건`)
}

/**
 * 소스 문자열에서 console.{method}(...) 호출을 제거한다.
 * @param {string} src
 * @returns {{ output: string, removed: number }}
 */
function stripConsoleCalls(src) {
  let out = ''
  let i = 0
  let removed = 0
  const len = src.length

  while (i < len) {
    const ch = src[i]
    const next = src[i + 1]

    // 한 줄 주석
    if (ch === '/' && next === '/') {
      const nl = src.indexOf('\n', i)
      const end = nl === -1 ? len : nl
      out += src.slice(i, end)
      i = end
      continue
    }
    // 블록 주석
    if (ch === '/' && next === '*') {
      const close = src.indexOf('*/', i + 2)
      const end = close === -1 ? len : close + 2
      out += src.slice(i, end)
      i = end
      continue
    }
    // 문자열 리터럴 (', ", `)
    if (ch === '"' || ch === "'") {
      const end = findStringEnd(src, i)
      out += src.slice(i, end)
      i = end
      continue
    }
    if (ch === '`') {
      const end = findTemplateEnd(src, i)
      out += src.slice(i, end)
      i = end
      continue
    }

    // console.{method}( 탐지 — 단어 경계 확인
    if (ch === 'c' && src.startsWith('console.', i) && isWordBoundary(src, i - 1)) {
      const methodStart = i + 'console.'.length
      const methodMatch = src.slice(methodStart).match(/^([a-zA-Z_$][\w$]*)\s*\(/)
      if (methodMatch && STRIPPED_METHODS.includes(methodMatch[1])) {
        const openParenIdx = methodStart + methodMatch[0].length - 1
        const closeParenIdx = findMatchingParen(src, openParenIdx)
        if (closeParenIdx !== -1) {
          // 호출 끝 다음에 세미콜론 / optional chaining / 쉼표 등이 있을 수 있음
          let endIdx = closeParenIdx + 1
          // trailing .catch()/.then() 같은 체이닝은 보존하지 않으면 문법 깨짐 위험 → 체이닝 탐지
          const tail = src.slice(endIdx)
          const chainMatch = tail.match(/^\s*\.\s*[a-zA-Z_$][\w$]*\s*\(/)
          if (chainMatch) {
            // 체이닝이 있다면 제거하지 않고 console 그대로 둔다 (안전 우선)
            out += src[i]
            i += 1
            continue
          }
          // 뒤 세미콜론 소비
          const semi = tail.match(/^\s*;/)
          if (semi) endIdx += semi[0].length

          // 문장 단독이면 앞쪽 공백(라인 시작까지)도 정리, 뒤 개행 1회 소비
          const lineStart = findLineStart(src, i)
          const prevLine = src.slice(lineStart, i)
          const isStatementLine = /^\s*$/.test(prevLine)
          if (isStatementLine) {
            // 이미 out 에 prevLine(공백)이 append 되어 있으므로 그만큼 되돌린다.
            out = out.slice(0, out.length - prevLine.length)
            // 뒤 개행 1회 소비
            if (src[endIdx] === '\n') endIdx += 1
            else if (src[endIdx] === '\r' && src[endIdx + 1] === '\n') endIdx += 2
          } else {
            // 중간에 낀 경우 빈 표현식 자리로 공백만 남김(세미콜론 이미 소비됨)
            out += ''
          }
          removed += 1
          i = endIdx
          continue
        }
      }
    }

    out += ch
    i += 1
  }

  return { output: out, removed }
}

function isWordBoundary(src, idx) {
  if (idx < 0) return true
  const prev = src[idx]
  return !/[A-Za-z0-9_$]/.test(prev)
}

function findStringEnd(src, start) {
  const quote = src[start]
  let i = start + 1
  while (i < src.length) {
    const c = src[i]
    if (c === '\\') { i += 2; continue }
    if (c === quote) return i + 1
    if (c === '\n') return i + 1 // 비정상 문자열이라도 멈춤(무한루프 방지)
    i += 1
  }
  return src.length
}

function findTemplateEnd(src, start) {
  let i = start + 1
  while (i < src.length) {
    const c = src[i]
    if (c === '\\') { i += 2; continue }
    if (c === '`') return i + 1
    if (c === '$' && src[i + 1] === '{') {
      // 중첩 표현식 ${...} — 균형 탐색
      let depth = 1
      i += 2
      while (i < src.length && depth > 0) {
        const d = src[i]
        if (d === '{') depth += 1
        else if (d === '}') depth -= 1
        else if (d === '`') {
          // 중첩 template — 재귀
          i = findTemplateEnd(src, i)
          continue
        } else if (d === '"' || d === "'") {
          i = findStringEnd(src, i)
          continue
        }
        i += 1
      }
      continue
    }
    i += 1
  }
  return src.length
}

function findMatchingParen(src, openIdx) {
  let depth = 0
  let i = openIdx
  const len = src.length
  while (i < len) {
    const c = src[i]
    if (c === '"' || c === "'") { i = findStringEnd(src, i); continue }
    if (c === '`') { i = findTemplateEnd(src, i); continue }
    if (c === '/' && src[i + 1] === '/') {
      const nl = src.indexOf('\n', i); i = nl === -1 ? len : nl; continue
    }
    if (c === '/' && src[i + 1] === '*') {
      const close = src.indexOf('*/', i + 2); i = close === -1 ? len : close + 2; continue
    }
    if (c === '(') depth += 1
    else if (c === ')') {
      depth -= 1
      if (depth === 0) return i
    }
    i += 1
  }
  return -1
}

function findLineStart(src, idx) {
  let i = idx - 1
  while (i >= 0 && src[i] !== '\n') i -= 1
  return i + 1
}

// ────────────────────────────────────────────────────────────
// entry
// ────────────────────────────────────────────────────────────

if (!fs.existsSync(TARGET)) {
  console.error(`[strip-console] 대상 경로 없음: ${TARGET}`)
  process.exit(1)
}
const stat = fs.statSync(TARGET)
if (!stat.isDirectory()) {
  console.error(`[strip-console] 디렉토리가 아님: ${TARGET}`)
  process.exit(1)
}

console.log(`[strip-console] 대상: ${TARGET}${DRY ? '  (dry-run)' : ''}`)
walk(TARGET)

console.log('')
console.log(`[strip-console] 검사 파일:  ${stats.total}`)
console.log(`[strip-console] 수정 파일:  ${stats.modified}`)
console.log(`[strip-console] 제거 건수:  ${stats.removals}`)
console.log(`[strip-console] 보존 대상:  console.error (프로덕션 장애 감시용)`)
