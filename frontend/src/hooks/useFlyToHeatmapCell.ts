import { useCallback } from 'react'

export function useFlyToHeatmapCell() {
  return useCallback((sourceEl: HTMLElement, date: string, onDone?: () => void) => {
    const target = document.querySelector(`[data-date="${date}"]`) as HTMLElement | null
    if (!target) { onDone?.(); return }

    const root = sourceEl.closest('.heatmap-root')
    if (root) {
      const rootRect = root.getBoundingClientRect()
      if (rootRect.top < 0 || rootRect.bottom > window.innerHeight) {
        root.scrollIntoView({ behavior: 'smooth', block: 'center' })
        setTimeout(() => doFly(sourceEl, target, onDone), 400)
        return
      }
    }
    doFly(sourceEl, target, onDone)
  }, [])
}

function doFly(sourceEl: HTMLElement, target: HTMLElement, onDone?: () => void) {
  const sRect = sourceEl.getBoundingClientRect()
  const tRect = target.getBoundingClientRect()

  const clone = sourceEl.cloneNode(true) as HTMLElement
  Object.assign(clone.style, {
    position: 'fixed',
    left: `${sRect.left + sRect.width / 2}px`,
    top: `${sRect.top + sRect.height / 2}px`,
    transform: 'translate(-50%, -50%) scale(1)',
    opacity: '1',
    pointerEvents: 'none',
    zIndex: '9999',
    transition: 'none',
    borderRadius: '8px',
    overflow: 'hidden',
  })
  document.body.appendChild(clone)

  const dx = tRect.left + tRect.width / 2 - (sRect.left + sRect.width / 2)
  const dy = tRect.top + tRect.height / 2 - (sRect.top + sRect.height / 2)

  clone.animate(
    [
      { transform: 'translate(-50%, -50%) scale(1)', opacity: 1, borderRadius: '8px' },
      {
        transform: `translate(calc(-50% + ${dx * 0.5}px), calc(-50% + ${dy * 0.4 - 30}px)) scale(0.4)`,
        opacity: 0.7,
        borderRadius: '50%',
        offset: 0.5,
      },
      {
        transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(0.1)`,
        opacity: 0,
        borderRadius: '50%',
      },
    ],
    { duration: 600, easing: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)', fill: 'forwards' }
  ).onfinish = () => {
    clone.remove()
    // Brief pulse on the target
    target.style.transition = 'transform 0.15s ease'
    target.style.transform = 'scale(1.3)'
    setTimeout(() => {
      target.style.transform = 'scale(1)'
      onDone?.()
    }, 150)
  }
}
