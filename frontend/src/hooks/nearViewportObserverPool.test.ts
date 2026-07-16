import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  nearViewportObserverPoolSize,
  observeNearViewport,
  resetNearViewportObserverPoolForTests,
} from './nearViewportObserverPool'

type ObserverEntry = { target: Element; isIntersecting: boolean }
const element = () => ({}) as Element

class MockIntersectionObserver {
  static instances: MockIntersectionObserver[] = []
  callback: (entries: ObserverEntry[]) => void
  observe = vi.fn()
  unobserve = vi.fn()
  disconnect = vi.fn()

  constructor(callback: (entries: ObserverEntry[]) => void) {
    this.callback = callback
    MockIntersectionObserver.instances.push(this)
  }

  intersect(target: Element) {
    this.callback([{ target, isIntersecting: true }])
  }
}

describe('nearViewportObserverPool', () => {
  afterEach(() => {
    resetNearViewportObserverPoolForTests()
    MockIntersectionObserver.instances = []
    vi.unstubAllGlobals()
  })

  it('shares one observer for elements with the same root margin', () => {
    vi.stubGlobal('IntersectionObserver', MockIntersectionObserver)
    const first = element()
    const second = element()
    const callbacks = [vi.fn(), vi.fn()]

    const cleanupFirst = observeNearViewport(first, '640px', callbacks[0])
    const cleanupSecond = observeNearViewport(second, '640px', callbacks[1])

    expect(MockIntersectionObserver.instances).toHaveLength(1)
    expect(nearViewportObserverPoolSize()).toBe(1)

    MockIntersectionObserver.instances[0].intersect(first)
    expect(callbacks[0]).toHaveBeenCalledOnce()
    expect(callbacks[1]).not.toHaveBeenCalled()
    expect(MockIntersectionObserver.instances[0].unobserve).toHaveBeenCalledWith(first)

    cleanupSecond()
    expect(nearViewportObserverPoolSize()).toBe(0)
    cleanupFirst()
  })

  it('uses separate observers for different root margins and falls back without observer support', () => {
    vi.stubGlobal('IntersectionObserver', MockIntersectionObserver)
    const first = element()
    const second = element()

    observeNearViewport(first, '480px', vi.fn())
    observeNearViewport(second, '640px', vi.fn())

    expect(MockIntersectionObserver.instances).toHaveLength(2)
    expect(nearViewportObserverPoolSize()).toBe(2)

    vi.stubGlobal('IntersectionObserver', undefined)
    const callback = vi.fn()
    const cleanup = observeNearViewport(element(), '480px', callback)
    cleanup()
    expect(callback).toHaveBeenCalledOnce()
  })
})
