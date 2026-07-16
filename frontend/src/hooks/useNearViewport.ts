import { useEffect, useRef, useState } from 'react'
import { observeNearViewport } from './nearViewportObserverPool'

export function useNearViewport<T extends Element>(rootMargin = '480px') {
  const ref = useRef<T | null>(null)
  const [nearViewport, setNearViewport] = useState(false)

  useEffect(() => {
    if (nearViewport) return
    const element = ref.current
    if (!element) return
    return observeNearViewport(element, rootMargin, () => {
      setNearViewport(true)
    })
  }, [nearViewport, rootMargin])

  return { ref, nearViewport }
}
