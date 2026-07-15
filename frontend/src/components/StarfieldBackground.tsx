import { useEffect, useRef } from 'react'

const STAR_COUNT = 120

interface StaticStar {
  x: number
  y: number
  radius: number
  alpha: number
}

function random(min: number, max?: number): number {
  const low = max === undefined ? 0 : Math.min(min, max)
  const high = max === undefined ? min : Math.max(min, max)
  return Math.floor(Math.random() * (high - low + 1)) + low
}

function createStar(width: number, height: number): StaticStar {
  return {
    x: random(width),
    y: random(height),
    radius: random(1, 4),
    alpha: random(2, 8) / 10,
  }
}

function createStarSprite(): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  const size = 96
  const half = size / 2
  canvas.width = size
  canvas.height = size

  const ctx = canvas.getContext('2d')
  if (!ctx) return canvas

  const gradient = ctx.createRadialGradient(half, half, 0, half, half, half)
  gradient.addColorStop(0, 'rgba(255,255,255,1)')
  gradient.addColorStop(0.18, 'rgba(190,230,255,0.88)')
  gradient.addColorStop(0.42, 'rgba(120,160,255,0.24)')
  gradient.addColorStop(1, 'rgba(120,160,255,0)')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, size, size)

  return canvas
}

export function StarfieldBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return

    let resizeFrame = 0
    const sprite = createStarSprite()

    const draw = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5)
      const width = window.innerWidth
      const height = window.innerHeight
      canvas.width = Math.floor(width * dpr)
      canvas.height = Math.floor(height * dpr)
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, width, height)
      ctx.globalCompositeOperation = 'lighter'

      const stars = Array.from({ length: STAR_COUNT }, () => createStar(width, height))
      for (const star of stars) {
        ctx.globalAlpha = star.alpha
        ctx.drawImage(sprite, star.x - star.radius / 2, star.y - star.radius / 2, star.radius, star.radius)
      }

      ctx.globalAlpha = 1
      ctx.globalCompositeOperation = 'source-over'
    }

    draw()
    const handleResize = () => {
      if (resizeFrame !== 0) window.cancelAnimationFrame(resizeFrame)
      resizeFrame = window.requestAnimationFrame(() => {
        resizeFrame = 0
        draw()
      })
    }
    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
      if (resizeFrame !== 0) window.cancelAnimationFrame(resizeFrame)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="starfield-background pointer-events-none fixed inset-0 z-0"
    />
  )
}
