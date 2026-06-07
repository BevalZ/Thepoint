export type SoundId = 'startupClaim'

interface SoundDefinition {
  src: string
  defaultVolume: number
}

interface PlaySoundOptions {
  volume?: number
  playbackRate?: number
  loop?: boolean
  deferUntilGesture?: boolean
}

interface DeferredSound {
  id: SoundId
  options: PlaySoundOptions
  attempts: number
}

export const SOUND_REGISTRY: Record<SoundId, SoundDefinition> = {
  startupClaim: {
    src: '/sounds/startup-claim-ready.mp3',
    defaultVolume: 0.36,
  },
}

const audioCache = new Map<SoundId, HTMLAudioElement>()
let gestureUnlockInstalled = false
let deferredSounds: DeferredSound[] = []
let startupSoundPlayed = false

function createSoundAudio(id: SoundId): HTMLAudioElement | null {
  if (typeof Audio === 'undefined') return null

  const definition = SOUND_REGISTRY[id]
  const audio = new Audio(definition.src)
  audio.preload = 'auto'
  audio.volume = definition.defaultVolume
  return audio
}

function getSoundAudio(id: SoundId): HTMLAudioElement | null {
  const cached = audioCache.get(id)
  if (cached) return cached

  const audio = createSoundAudio(id)
  if (!audio) return null

  audioCache.set(id, audio)
  return audio
}

export function preloadSound(id: SoundId) {
  const audio = getSoundAudio(id)
  audio?.load()
}

function removeGestureUnlockListeners(listener: EventListener) {
  if (typeof window === 'undefined') return

  window.removeEventListener('pointerdown', listener, true)
  window.removeEventListener('keydown', listener, true)
  window.removeEventListener('touchstart', listener, true)
}

function installGestureUnlock() {
  if (gestureUnlockInstalled || typeof window === 'undefined') return

  gestureUnlockInstalled = true

  const handleGesture: EventListener = () => {
    removeGestureUnlockListeners(handleGesture)
    gestureUnlockInstalled = false
    flushDeferredSounds()
  }

  window.addEventListener('pointerdown', handleGesture, { capture: true, once: true })
  window.addEventListener('keydown', handleGesture, { capture: true, once: true })
  window.addEventListener('touchstart', handleGesture, { capture: true, once: true })
}

function queueDeferredSound(id: SoundId, options: PlaySoundOptions, attempts: number) {
  deferredSounds.push({ id, options, attempts })
  installGestureUnlock()
}

function flushDeferredSounds() {
  const sounds = deferredSounds
  deferredSounds = []

  sounds.forEach(({ id, options, attempts }) => {
    void attemptPlaySound(id, options).then((played) => {
      if (!played && attempts < 2) {
        queueDeferredSound(id, options, attempts + 1)
      }
    })
  })
}

async function attemptPlaySound(id: SoundId, options: PlaySoundOptions): Promise<boolean> {
  const source = getSoundAudio(id)
  if (!source) return false

  const target = source.paused ? source : createSoundAudio(id)
  if (!target) return false

  const definition = SOUND_REGISTRY[id]

  target.volume = options.volume ?? definition.defaultVolume
  target.playbackRate = options.playbackRate ?? 1
  target.loop = options.loop ?? false
  target.currentTime = 0

  try {
    await target.play()
    return true
  } catch {
    return false
  }
}

export function playSound(id: SoundId, options: PlaySoundOptions = {}) {
  void attemptPlaySound(id, options).then((played) => {
    if (!played && options.deferUntilGesture) {
      queueDeferredSound(id, options, 0)
    }
  })
}

export function playStartupSoundNow() {
  if (startupSoundPlayed) return
  startupSoundPlayed = true
  preloadSound('startupClaim')
  playSound('startupClaim', { deferUntilGesture: true })
}
