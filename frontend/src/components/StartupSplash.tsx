import { useEffect, useMemo, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { cn } from '@/lib/utils'

const OPENING_TEXT = 'Your point is great!'
const CLAIM_TEXT = "Now it's mine"
const GLYPHS = ['#', '%', '&', '?', '@', '+', '=', '*', '/', '\\', '|', '~', '!']

type SplashPhase = 'opening' | 'scrambling' | 'burst' | 'claim'

interface StartupSplashProps {
  onComplete: () => void
  className?: string
}

interface Particle {
  id: number
  x: number
  y: number
  rotate: number
  scale: number
  delay: number
  duration: number
}

const PARTICLES: Particle[] = Array.from({ length: 58 }, (_, id) => {
  const angle = id * 2.399963
  const distance = 90 + (id % 9) * 18
  return {
    id,
    x: Math.cos(angle) * distance,
    y: Math.sin(angle) * distance * 0.66,
    rotate: (id % 2 === 0 ? 1 : -1) * (45 + id * 7),
    scale: 0.6 + (id % 5) * 0.16,
    delay: (id % 10) * 0.012,
    duration: 0.7 + (id % 6) * 0.04,
  }
})

function buildScramble(tick: number): string {
  const length = Math.max(OPENING_TEXT.length, CLAIM_TEXT.length)

  return Array.from({ length }, (_, index) => {
    if (tick < 4 && index < OPENING_TEXT.length) return OPENING_TEXT[index]
    return GLYPHS[(tick + index * 3) % GLYPHS.length]
  }).join('')
}

function DissolvingText({ text }: { text: string }) {
  return (
    <span className="inline-block">
      {Array.from(text).map((char, index) => {
        const particle = PARTICLES[index % PARTICLES.length]

        return (
          <motion.span
            key={`${char}-${index}`}
            className="inline-block"
            initial={{ opacity: 1, x: 0, y: 0, rotate: 0, scale: 1 }}
            animate={{
              opacity: 0,
              x: particle.x * 0.42,
              y: particle.y * 0.42,
              rotate: particle.rotate,
              scale: particle.scale,
            }}
            transition={{
              duration: particle.duration,
              delay: particle.delay,
              ease: 'easeOut',
            }}
          >
            {char === ' ' ? '\u00a0' : char}
          </motion.span>
        )
      })}
    </span>
  )
}

function ParticleBurst() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-visible">
      {PARTICLES.map((particle) => (
        <motion.span
          key={particle.id}
          className={cn(
            'absolute left-1/2 top-1/2 h-1.5 w-1.5 rounded-full',
            particle.id % 3 === 0 ? 'bg-accent' : 'bg-fg-muted'
          )}
          initial={{ opacity: 0, x: 0, y: 0, scale: 0.2 }}
          animate={{
            opacity: [0, 0.9, 0],
            x: particle.x,
            y: particle.y,
            scale: [0.2, particle.scale, 0.1],
          }}
          transition={{
            duration: particle.duration,
            delay: particle.delay,
            ease: 'easeOut',
          }}
        />
      ))}
    </div>
  )
}

function SignalRings({ phase }: { phase: SplashPhase }) {
  const active = phase === 'burst' || phase === 'claim'

  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
      {[0, 1, 2].map((ring) => (
        <motion.span
          key={ring}
          className="absolute h-32 w-32 rounded-full border border-border-strong"
          animate={active ? { opacity: [0, 0.5, 0], scale: [0.72, 1.45, 1.9] } : { opacity: 0, scale: 0.72 }}
          transition={{ duration: 1.05, delay: ring * 0.12, ease: 'easeOut' }}
        />
      ))}
    </div>
  )
}

function SignalText({ text, phase }: { text: string; phase: SplashPhase }) {
  const showEcho = phase === 'scrambling'

  return (
    <span className="relative inline-block">
      {showEcho && (
        <>
          <motion.span
            aria-hidden
            className="absolute inset-0 text-accent/60"
            animate={{ opacity: [0.5, 0.15, 0.45], x: [-3, 2, -1] }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
          >
            {text}
          </motion.span>
          <motion.span
            aria-hidden
            className="absolute inset-0 text-fg-muted/40"
            animate={{ opacity: [0.25, 0.45, 0.2], x: [3, -2, 1] }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
          >
            {text}
          </motion.span>
        </>
      )}
      <span className="relative">{text}</span>
    </span>
  )
}

function ClaimText() {
  return (
    <span className="inline-block">
      {Array.from(CLAIM_TEXT).map((char, index) => (
        <motion.span
          key={`${char}-${index}`}
          className="inline-block"
          initial={{ opacity: 0, y: 18, rotateX: -60 }}
          animate={{ opacity: 1, y: 0, rotateX: 0 }}
          transition={{
            duration: 0.38,
            delay: index * 0.028,
            ease: [0.2, 0.9, 0.2, 1],
          }}
        >
          {char === ' ' ? '\u00a0' : char}
        </motion.span>
      ))}
    </span>
  )
}

export function StartupSplash({ onComplete, className }: StartupSplashProps) {
  const prefersReducedMotion = useReducedMotion()
  const [phase, setPhase] = useState<SplashPhase>('opening')
  const [tick, setTick] = useState(0)
  const [burstText, setBurstText] = useState(OPENING_TEXT)

  useEffect(() => {
    if (prefersReducedMotion) {
      setPhase('claim')
      const completeTimer = window.setTimeout(onComplete, 900)
      return () => window.clearTimeout(completeTimer)
    }

    const tickTimer = window.setInterval(() => setTick((value) => value + 1), 48)
    const timers = [
      window.setTimeout(() => setPhase('scrambling'), 520),
      window.setTimeout(() => {
        setBurstText(buildScramble(28))
        setPhase('burst')
      }, 1520),
      window.setTimeout(() => setPhase('claim'), 2350),
      window.setTimeout(onComplete, 3900),
    ]

    return () => {
      window.clearInterval(tickTimer)
      timers.forEach((timer) => window.clearTimeout(timer))
    }
  }, [onComplete, prefersReducedMotion])

  const displayText = useMemo(() => {
    if (phase === 'opening') return OPENING_TEXT
    if (phase === 'scrambling') return buildScramble(tick)
    if (phase === 'burst') return burstText
    return CLAIM_TEXT
  }, [burstText, phase, tick])

  return (
    <motion.div
      className={cn('fixed inset-x-0 bottom-0 top-11 z-40 bg-bg text-fg', className)}
      initial={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.42, ease: 'easeInOut' }}
    >
      <div className="absolute inset-x-10 top-10 h-px bg-border" />
      <div className="absolute inset-x-10 bottom-10 h-px bg-border" />

      <div className="relative flex h-full flex-col items-center justify-center px-6">
        <SignalRings phase={phase} />

        <motion.div
          className="mb-8 h-2 w-2 rounded-full bg-accent"
          animate={prefersReducedMotion ? undefined : { scale: [1, 1.8, 1], opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 1.1, repeat: Infinity, ease: 'easeInOut' }}
        />

        <div className="relative flex min-h-28 items-center justify-center text-center font-mono text-3xl font-semibold tracking-normal sm:text-5xl">
          {phase === 'burst' ? (
            <>
              <DissolvingText text={displayText} />
              <ParticleBurst />
            </>
          ) : phase === 'claim' ? (
            <ClaimText />
          ) : (
            <motion.span
              key="signal"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.26, ease: 'easeOut' }}
            >
              <SignalText text={displayText} phase={phase} />
            </motion.span>
          )}
        </div>

        <div className="mt-8 flex h-1 w-44 overflow-hidden rounded-full bg-bg-hover">
          <motion.div
            className="h-full origin-left bg-accent"
            initial={{ scaleX: 0 }}
            animate={{ scaleX: phase === 'claim' ? 1 : phase === 'burst' ? 0.82 : 0.42 }}
            transition={{ duration: 0.42, ease: 'easeOut' }}
          />
        </div>
      </div>
    </motion.div>
  )
}
