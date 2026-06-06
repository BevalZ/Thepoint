import { useCallback } from 'react'

export function useStarFly() {
  return useCallback((sourceEl: HTMLElement) => {
    const rect = sourceEl.getBoundingClientRect()
    const startX = rect.left + rect.width / 2
    const startY = rect.top + rect.height / 2
    // compute ring center at call-time so window resizes are handled correctly
    const ringX = window.innerWidth - 28
    const ringY = window.innerHeight - 28

    const clone = sourceEl.cloneNode(true) as HTMLElement
    Object.assign(clone.style, {
      position: 'fixed',
      left: `${startX}px`,
      top: `${startY}px`,
      transform: 'translate(-50%, -50%) scale(1)',
      opacity: '1',
      pointerEvents: 'none',
      zIndex: '9999',
      transition: 'none',
    })
    document.body.appendChild(clone)

    const dx = ringX - startX
    const dy = ringY - startY

    clone.animate(
      [
        { transform: 'translate(-50%, -50%) scale(1)', opacity: 1 },
        {
          transform: `translate(calc(-50% + ${dx * 0.5}px), calc(-50% + ${dy * 0.4 - 40}px)) scale(0.6)`,
          opacity: 0.8,
          offset: 0.5,
        },
        { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(0.2)`, opacity: 0 },
      ],
      { duration: 600, easing: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)', fill: 'forwards' }
    ).onfinish = () => clone.remove()
  }, [])
}
