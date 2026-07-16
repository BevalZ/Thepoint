export interface ReanalysisTextInput {
  currentText: string
  historyText?: string | null
  chunkTexts?: readonly string[]
}

export function reanalysisTextForCurrent({ currentText, historyText, chunkTexts = [] }: ReanalysisTextInput): string {
  const current = currentText.trim()
  if (current) return current

  const history = historyText?.trim() ?? ''
  if (history) return history

  return chunkTexts
    .map((text) => text.trim())
    .filter(Boolean)
    .join('\n\n')
}
