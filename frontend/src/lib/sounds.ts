export type SoundId = 'startupClaim'

interface SoundDefinition {
  src: string
  defaultVolume: number
}

interface PlaySoundOptions {
  volume?: number
  playbackRate?: number
  loop?: boolean
}

export const SOUND_REGISTRY: Record<SoundId, SoundDefinition> = {
  startupClaim: {
    src: '/sounds/startup-claim.mp3',
    defaultVolume: 0.36,
  },
}

const audioCache = new Map<SoundId, HTMLAudioElement>()

function getSoundAudio(id: SoundId): HTMLAudioElement | null {
  if (typeof Audio === 'undefined') return null

  const cached = audioCache.get(id)
  if (cached) return cached

  const definition = SOUND_REGISTRY[id]
  const audio = new Audio(definition.src)
  audio.preload = 'auto'
  audio.volume = definition.defaultVolume
  audioCache.set(id, audio)
  return audio
}

export function preloadSound(id: SoundId) {
  const audio = getSoundAudio(id)
  audio?.load()
}

export function playSound(id: SoundId, options: PlaySoundOptions = {}) {
  const source = getSoundAudio(id)
  if (!source) return

  const target = source.paused ? source : (source.cloneNode(true) as HTMLAudioElement)
  const definition = SOUND_REGISTRY[id]

  target.volume = options.volume ?? definition.defaultVolume
  target.playbackRate = options.playbackRate ?? 1
  target.loop = options.loop ?? false
  target.currentTime = 0

  void target.play().catch(() => undefined)
}
