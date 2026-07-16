const ASCII_SENTENCE_BREAKS = new Set(['!', '?', ';'])
const CJK_SENTENCE_BREAKS = new Set(['。', '！', '？', '；'])
const PROTECTED_PERIOD_WORDS = new Set([
  'al',
  'cf',
  'dr',
  'e',
  'eg',
  'eq',
  'etc',
  'fig',
  'g',
  'i',
  'ie',
  'mr',
  'mrs',
  'ms',
  'no',
  'prof',
  'ref',
  'vs',
])

export function splitSentenceLikeParts(text: string, maxChars: number): string[] {
  const normalized = text.replace(/\s+/g, ' ').trim()
  if (!normalized) return []
  const limit = Math.max(1, Math.floor(maxChars))

  const chars = Array.from(normalized)
  const parts: string[] = []
  let start = 0

  for (let index = 0; index < chars.length; index += 1) {
    if (!isSentenceBreakAt(chars, index)) continue
    pushSegment(parts, chars.slice(start, index + 1).join(''), limit)
    start = index + 1
  }

  pushSegment(parts, chars.slice(start).join(''), limit)
  return parts
}

export function isSentenceBreakAt(chars: readonly string[], index: number): boolean {
  const ch = chars[index]
  if (CJK_SENTENCE_BREAKS.has(ch) || ASCII_SENTENCE_BREAKS.has(ch)) return true
  if (ch !== '.') return false
  return !isProtectedEnglishPeriod(chars, index)
}

function pushSegment(parts: string[], segment: string, maxChars: number) {
  const trimmed = segment.trim()
  if (!trimmed) return
  const chars = Array.from(trimmed)
  if (chars.length <= maxChars) {
    parts.push(trimmed)
    return
  }
  for (let start = 0; start < chars.length; start += maxChars) {
    const chunk = chars.slice(start, start + maxChars).join('').trim()
    if (chunk) parts.push(chunk)
  }
}

function isProtectedEnglishPeriod(chars: readonly string[], index: number): boolean {
  const previous = chars[index - 1] ?? ''
  const next = chars[index + 1] ?? ''
  if (isAsciiDigit(previous) && isAsciiDigit(next)) return true
  if (isAsciiLetter(previous) && isAsciiLetter(next)) return true
  if (endsWithCompactInitialism(chars, index)) return true

  const word = wordBeforePeriod(chars, index).toLowerCase()
  if (PROTECTED_PERIOD_WORDS.has(word)) return true
  if (word.length === 1 && isAsciiLetter(previous)) return true
  return false
}

function endsWithCompactInitialism(chars: readonly string[], index: number): boolean {
  let start = index
  while (start > 0 && (isAsciiLetter(chars[start - 1]) || chars[start - 1] === '.')) {
    start -= 1
  }
  const token = chars.slice(start, index + 1).join('')
  if (token.length > 10) return false
  if ((token.match(/\./g) ?? []).length < 2) return false
  return /^[A-Za-z](?:\.[A-Za-z])+\.?$/.test(token)
}

function wordBeforePeriod(chars: readonly string[], index: number): string {
  let start = index
  while (start > 0 && isAsciiLetter(chars[start - 1])) {
    start -= 1
  }
  return chars.slice(start, index).join('')
}

function isAsciiLetter(value: string): boolean {
  return /^[A-Za-z]$/.test(value)
}

function isAsciiDigit(value: string): boolean {
  return /^\d$/.test(value)
}
