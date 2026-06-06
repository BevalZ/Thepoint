import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Loader2 } from 'lucide-react'
import { useStarStore } from '@/store'
import { generateDigest } from '@/api'
import { DigestModal } from './DigestModal'

const SIZE = 56
const R = 22
const CIRC = 2 * Math.PI * R

function ringParams(count: number) {
  if (count <= 0) return { dash: 0, strokeW: 3, fillOpacity: 0 }
  if (count <= 10) return { dash: CIRC * (count / 10), strokeW: 3, fillOpacity: 0 }
  if (count <= 50) {
    const t = (count - 10) / 40
    return { dash: CIRC, strokeW: 3 + t * 5, fillOpacity: t * 0.4 }
  }
  return { dash: CIRC, strokeW: 8, fillOpacity: 0.4 }
}

// TODO(gallery): onNavigateGallery prop removed; re-add when gallery feature is re-enabled
export function StarRing() {
  const { count, init } = useStarStore()
  const [generating, setGenerating] = useState(false)
  const [digest, setDigest] = useState<string | null>(null)

  useEffect(() => { init() }, [init])

  const { dash, strokeW, fillOpacity } = ringParams(count)
  const ready = count >= 10

  const handleClick = async () => {
    if (!ready || generating) return
    setGenerating(true)
    try {
      const result = await generateDigest()
      setDigest(result)
    } catch {
      // silent — user can retry
    } finally {
      setGenerating(false)
    }
  }

  return (
    <>
      <AnimatePresence>
        {count > 0 && (
          <motion.button
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            whileTap={{ scale: 0.9 }}
            onClick={handleClick}
            className="fixed bottom-6 right-6 z-50 flex items-center justify-center"
            style={{ width: SIZE, height: SIZE, cursor: ready ? 'pointer' : 'default' }}
            title={ready ? '点击生成知识研报' : `已采集 ${count} 个 point，还需 ${10 - count} 个`}
          >
            <svg width={SIZE} height={SIZE} className="absolute inset-0">
              <circle cx={SIZE/2} cy={SIZE/2} r={R} fill="none" stroke="var(--color-border)" strokeWidth={2} />
              <circle cx={SIZE/2} cy={SIZE/2} r={R}
                fill={`color-mix(in srgb, var(--color-accent) ${Math.round(fillOpacity * 100)}%, transparent)`}
                stroke="none" style={{ transition: 'fill 0.4s ease' }} />
              <circle cx={SIZE/2} cy={SIZE/2} r={R}
                fill="none" stroke="var(--color-accent)"
                strokeWidth={strokeW}
                strokeDasharray={`${dash} ${CIRC}`} strokeDashoffset={0}
                strokeLinecap="round"
                transform={`rotate(-90 ${SIZE/2} ${SIZE/2})`}
                className={ready && !generating ? 'animate-pulse' : ''}
                style={{ transition: 'stroke-dasharray 0.4s ease, stroke-width 0.4s ease' }}
              />
            </svg>
            <span className="relative text-xs font-semibold text-fg" style={{ fontSize: 11 }}>
              {generating ? <Loader2 size={14} className="animate-spin" /> : count}
            </span>
          </motion.button>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {digest && <DigestModal content={digest} onClose={() => setDigest(null)} />}
      </AnimatePresence>
    </>
  )
}
