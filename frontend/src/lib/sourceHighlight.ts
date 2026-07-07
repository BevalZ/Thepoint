export interface SourceHighlightRequest {
  sourceId: string
  chunkIndex?: number | null
  label?: string | null
  quote?: string | null
  snippet?: string | null
  start?: number | null
  end?: number | null
}

export type SourceHighlightSegment =
  | { kind: 'text'; text: string }
  | { kind: 'match'; text: string }

export function splitSourceHighlight(content: string, request: SourceHighlightRequest | null | undefined): SourceHighlightSegment[] | null {
  if (!request) return null

  const byOffset = splitByCharacterOffset(content, request.start, request.end, request.quote)
  if (byOffset) return byOffset

  const quote = normalizedNeedle(request.quote)
  if (quote) {
    const byQuote = splitByText(content, quote)
    if (byQuote) return byQuote
  }

  const snippet = normalizedNeedle(request.snippet)
  if (snippet) return splitByText(content, snippet)

  return null
}

function splitByCharacterOffset(
  content: string,
  start: number | null | undefined,
  end: number | null | undefined,
  quote: string | null | undefined
): SourceHighlightSegment[] | null {
  if (!Number.isInteger(start) || !Number.isInteger(end)) return null
  if (start === null || start === undefined || end === null || end === undefined) return null
  if (start < 0 || end <= start) return null

  const chars = Array.from(content)
  if (end > chars.length) return null

  const match = chars.slice(start, end).join('')
  if (!match.trim()) return null

  const expected = normalizedNeedle(quote)
  if (expected && normalizeComparable(match) !== normalizeComparable(expected)) return null

  return compactSegments([
    { kind: 'text', text: chars.slice(0, start).join('') },
    { kind: 'match', text: match },
    { kind: 'text', text: chars.slice(end).join('') },
  ])
}

function splitByText(content: string, needle: string): SourceHighlightSegment[] | null {
  const index = content.indexOf(needle)
  if (index < 0) return null

  return compactSegments([
    { kind: 'text', text: content.slice(0, index) },
    { kind: 'match', text: content.slice(index, index + needle.length) },
    { kind: 'text', text: content.slice(index + needle.length) },
  ])
}

function normalizedNeedle(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

function normalizeComparable(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function compactSegments(segments: SourceHighlightSegment[]): SourceHighlightSegment[] {
  return segments.filter((segment) => segment.text.length > 0)
}
