type ObserverCallback = () => void

interface ObserverPoolEntry {
  observer: IntersectionObserver
  callbacks: Map<Element, ObserverCallback>
}

const pools = new Map<string, ObserverPoolEntry>()

function observerKey(rootMargin: string): string {
  return `viewport|${rootMargin}`
}

export function observeNearViewport(
  element: Element,
  rootMargin: string,
  callback: ObserverCallback,
): () => void {
  if (typeof IntersectionObserver === 'undefined') {
    callback()
    return () => {}
  }

  const key = observerKey(rootMargin)
  let pool = pools.get(key)
  if (!pool) {
    const callbacks = new Map<Element, ObserverCallback>()
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue
        const cb = callbacks.get(entry.target)
        if (!cb) continue
        callbacks.delete(entry.target)
        observer.unobserve(entry.target)
        cb()
      }
      if (callbacks.size === 0) {
        observer.disconnect()
        pools.delete(key)
      }
    }, { rootMargin })
    pool = { observer, callbacks }
    pools.set(key, pool)
  }

  pool.callbacks.set(element, callback)
  pool.observer.observe(element)

  return () => {
    const current = pools.get(key)
    if (!current) return
    current.callbacks.delete(element)
    current.observer.unobserve(element)
    if (current.callbacks.size === 0) {
      current.observer.disconnect()
      pools.delete(key)
    }
  }
}

export function nearViewportObserverPoolSize(): number {
  return pools.size
}

export function resetNearViewportObserverPoolForTests() {
  for (const pool of pools.values()) {
    pool.observer.disconnect()
  }
  pools.clear()
}
