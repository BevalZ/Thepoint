import { useEffect, useRef } from 'react'
import { useReducedMotion } from 'framer-motion'

const STAR_COUNT = 220

interface OrbitStar {
  orbitRadius: number
  radius: number
  orbitX: number
  orbitY: number
  timePassed: number
  speed: number
  alpha: number
}

function random(min: number, max?: number): number {
  const low = max === undefined ? 0 : Math.min(min, max)
  const high = max === undefined ? min : Math.max(min, max)
  return Math.floor(Math.random() * (high - low + 1)) + low
}

function maxOrbit(width: number, height: number): number {
  const max = Math.max(width, height)
  const diameter = Math.round(Math.sqrt(max * max + max * max))
  return diameter / 2
}

function createStar(width: number, height: number): OrbitStar {
  const orbitRadius = random(maxOrbit(width, height))

  return {
    orbitRadius,
    radius: random(50, Math.max(60, orbitRadius)) / 22,
    orbitX: width / 2,
    orbitY: height / 2,
    timePassed: random(0, STAR_COUNT),
    speed: random(Math.max(1, orbitRadius)) / 520000,
    alpha: random(2, 9) / 10,
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
  const prefersReducedMotion = useReducedMotion()

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return

    let frame = 0
    let stars: OrbitStar[] = []
    const sprite = createStarSprite()

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const width = window.innerWidth
      const height = window.innerHeight
      canvas.width = Math.floor(width * dpr)
      canvas.height = Math.floor(height * dpr)
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      stars = Array.from({ length: STAR_COUNT }, () => createStar(width, height))
    }

    const draw = () => {
      const width = window.innerWidth
      const height = window.innerHeight
      ctx.clearRect(0, 0, width, height)
      ctx.globalCompositeOperation = 'lighter'

      for (const star of stars) {
        const x = Math.sin(star.timePassed) * star.orbitRadius + star.orbitX
        const y = Math.cos(star.timePassed) * star.orbitRadius + star.orbitY
        const twinkle = random(14)

        if (!prefersReducedMotion) {
          if (twinkle === 1 && star.alpha > 0.18) star.alpha -= 0.035
          else if (twinkle === 2 && star.alpha < 0.86) star.alpha += 0.035
          star.timePassed += star.speed
        }

        ctx.globalAlpha = star.alpha
        ctx.drawImage(sprite, x - star.radius / 2, y - star.radius / 2, star.radius, star.radius)
      }

      ctx.globalAlpha = 1
      ctx.globalCompositeOperation = 'source-over'
      if (!prefersReducedMotion) frame = window.requestAnimationFrame(draw)
    }

    resize()
    draw()
    window.addEventListener('resize', resize)

    return () => {
      window.removeEventListener('resize', resize)
      if (frame !== 0) window.cancelAnimationFrame(frame)
    }
  }, [prefersReducedMotion])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none fixed inset-0 z-0 opacity-55"
    />
  )
}
