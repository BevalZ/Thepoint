import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('sounds', () => {
  let playResults: Array<'reject' | 'resolve'>
  let playCalls: string[]
  let pointerdownListener: EventListener | null

  class MockAudio {
    src: string
    preload = ''
    volume = 1
    paused = true
    playbackRate = 1
    loop = false
    currentTime = 0

    constructor(src: string) {
      this.src = src
    }

    load = vi.fn()

    play = vi.fn(() => {
      playCalls.push(this.src)
      this.paused = false
      const result = playResults.shift()
      if (result === 'reject') return Promise.reject(new Error('NotAllowedError'))
      return Promise.resolve()
    })
  }

  beforeEach(() => {
    vi.resetModules()
    playResults = []
    playCalls = []
    pointerdownListener = null
    vi.stubGlobal('window', {
      addEventListener: vi.fn((type: string, listener: EventListener) => {
        if (type === 'pointerdown') pointerdownListener = listener
      }),
      removeEventListener: vi.fn(),
    })
    vi.stubGlobal('Audio', MockAudio)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('retries deferred audio after the first user gesture when autoplay blocks playback', async () => {
    playResults = ['reject', 'resolve']
    const { playSound } = await import('./sounds')

    playSound('startupClaim', { deferUntilGesture: true })
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(playCalls).toEqual(['/sounds/startup-claim-ready.mp3'])

    expect(pointerdownListener).not.toBeNull()
    pointerdownListener?.(new Event('pointerdown'))
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(playCalls).toEqual(['/sounds/startup-claim-ready.mp3', '/sounds/startup-claim-ready.mp3'])
  })
})
