import { describe, expect, it } from 'vitest'
import { reanalysisTextForCurrent } from './exploreReanalysis'

describe('reanalysisTextForCurrent', () => {
  it('uses the current text when it is available', () => {
    expect(reanalysisTextForCurrent({
      currentText: '当前来源正文',
      historyText: '历史正文',
      chunkTexts: ['分块正文'],
    })).toBe('当前来源正文')
  })

  it('falls back to the matching history text after reopening a source', () => {
    expect(reanalysisTextForCurrent({
      currentText: '',
      historyText: '从历史记录恢复的正文',
      chunkTexts: ['已保存分块'],
    })).toBe('从历史记录恢复的正文')
  })

  it('falls back to saved chunks when no history text exists', () => {
    expect(reanalysisTextForCurrent({
      currentText: '  ',
      historyText: null,
      chunkTexts: ['第一块', '第二块'],
    })).toBe('第一块\n\n第二块')
  })
})
