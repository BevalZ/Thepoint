import { useEffect, useRef, useState } from 'react'

export function useNearViewport<T extends Element>(rootMargin = '480px') {
  const ref = useRef<T | null>(null)
  const [nearViewport, setNearViewport] = useState(false)

  useEffect(() => {
    if (nearViewport) return
    const element = ref.current
    if (!element) return
    if (typeof IntersectionObserver === 'undefined') {
      setNearViewport(true)
      return
    }

    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return
      setNearViewport(true)
      observer.disconnect()
    }, { rootMargin })
    observer.observe(element)
    return () => observer.disconnect()
  }, [nearViewport, rootMargin])

  return { ref, nearViewport }
}
