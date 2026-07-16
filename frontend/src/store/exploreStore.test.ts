import { beforeEach, describe, expect, it, vi } from 'vitest'

const api = vi.hoisted(() => ({
  analyzeTextStreaming: vi.fn(),
  fetchUrl: vi.fn(),
  getFileMetadata: vi.fn(),
  getSourceWorkspaceSummary: vi.fn(),
  openSourceWorkspace: vi.fn(),
  parseDocument: vi.fn(),
  planContent: vi.fn(),
  upsertSourceDocument: vi.fn(),
}))

const events = vi.hoisted(() => ({
  handlers: new Map<string, (event: unknown) => void>(),
  listen: vi.fn(),
  unlisteners: [] as Array<ReturnType<typeof vi.fn>>,
}))

vi.mock('@/api', () => api)
vi.mock('@tauri-apps/api/event', () => ({ listen: events.listen }))

import { useExploreStore } from './exploreStore'

const plan = { units: [], chunks: [] }

describe('useExploreStore reanalysis lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    events.handlers.clear()
    events.unlisteners.length = 0
    events.listen.mockImplementation(async (name: string, handler: (event: unknown) => void) => {
      const unlisten = vi.fn()
      events.handlers.set(name, handler)
      events.unlisteners.push(unlisten)
      return unlisten
    })
    api.planContent.mockResolvedValue(plan)
    api.analyzeTextStreaming.mockResolvedValue(undefined)
    useExploreStore.setState({
      sourceId: null,
      text: 'Current source body',
      richHtml: null,
      sourceUrl: null,
      chunkCards: [],
      contentPlan: null,
      analyzing: false,
      parsing: false,
      error: null,
    })
  })

  it('settles and removes both listeners when the command resolves without a done event', async () => {
    await useExploreStore.getState().reanalyzeCurrent()

    expect(api.analyzeTextStreaming).toHaveBeenCalledWith('Current source body', null, plan)
    expect(useExploreStore.getState().analyzing).toBe(false)
    expect(events.unlisteners).toHaveLength(2)
    expect(events.unlisteners.map((unlisten) => unlisten.mock.calls.length)).toEqual([1, 1])
  })

  it('does not turn a completed event into an error when the command rejects afterwards', async () => {
    api.analyzeTextStreaming.mockImplementation(async () => {
      events.handlers.get('chunk_cards_done')?.({})
      throw new Error('late command rejection')
    })

    await useExploreStore.getState().reanalyzeCurrent()

    expect(useExploreStore.getState().analyzing).toBe(false)
    expect(useExploreStore.getState().error).toBeNull()
    expect(events.unlisteners.map((unlisten) => unlisten.mock.calls.length)).toEqual([1, 1])
  })
})
