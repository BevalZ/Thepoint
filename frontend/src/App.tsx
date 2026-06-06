import { useCallback, useEffect, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion, type Variants } from 'framer-motion'
import { BarChart2, Compass, Settings as SettingsIcon, Library as LibraryIcon } from 'lucide-react'
import Settings from '@/pages/Settings'
import Explore from '@/pages/Explore'
import Library from '@/pages/Library'
import Analytics from '@/pages/Analytics'
// TODO(gallery): re-enable when AI gallery feature is ready for release
// import Gallery from '@/pages/Gallery'
// import { Image } from 'lucide-react'
import { StarRing } from '@/components/StarRing'
import { StartupSplash } from '@/components/StartupSplash'
import { useConfigStore, useThemeStore } from '@/store'
import { cn } from '@/lib/utils'

type Page = 'explore' | 'library' | 'analytics' | 'settings'
// TODO(gallery): add 'gallery' back to Page union when re-enabling

const NAV: { id: Page; label: string; icon: typeof Compass }[] = [
  { id: 'explore', label: '探索', icon: Compass },
  { id: 'library', label: '知识库', icon: LibraryIcon },
  // TODO(gallery): { id: 'gallery', label: '画廊', icon: Image },
  { id: 'analytics', label: '统计', icon: BarChart2 },
  { id: 'settings', label: '设置', icon: SettingsIcon },
]

const NAV_ITEM_VARIANTS: Variants = {
  rest: { x: 0, rotateY: 0 },
  hover: {
    x: 4,
    rotateY: -4,
    transition: { duration: 0.18, ease: 'easeOut' },
  },
}

const NAV_SWEEP_VARIANTS: Variants = {
  rest: { opacity: 0, x: 0 },
  hover: {
    opacity: [0, 0.62, 0],
    x: 230,
    transition: { duration: 0.46, ease: 'easeOut' },
  },
}

export default function App() {
  const [page, setPage] = useState<Page>('explore')
  const [showSplash, setShowSplash] = useState(true)
  const prefersReducedMotion = useReducedMotion()
  const { loaded, fetchConfig } = useConfigStore()
  useThemeStore()

  useEffect(() => {
    if (!loaded) fetchConfig()
  }, [loaded, fetchConfig])

  const handleSplashComplete = useCallback(() => setShowSplash(false), [])

  const renderPage = () => {
    if (page === 'settings') return <Settings />
    if (page === 'library') return <Library />
    if (page === 'analytics') return <Analytics />
    // TODO(gallery): if (page === 'gallery') return <Gallery />
    return <Explore />
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <AnimatePresence>
        {showSplash && <StartupSplash onComplete={handleSplashComplete} />}
      </AnimatePresence>

      <motion.nav
        className="flex w-52 shrink-0 flex-col border-r border-border bg-bg-elevated px-3 py-5"
        initial={prefersReducedMotion ? false : { opacity: 0, x: -14 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.28, ease: 'easeOut' }}
      >
        <div className="px-2 pb-5 text-sm font-semibold tracking-normal">
          Deep Explorer
        </div>
        {NAV.map(({ id, label, icon: Icon }) => (
          <motion.button
            key={id}
            onClick={() => setPage(id)}
            variants={NAV_ITEM_VARIANTS}
            initial="rest"
            whileHover={prefersReducedMotion ? undefined : 'hover'}
            whileTap={prefersReducedMotion ? undefined : { scale: 0.98 }}
            aria-current={page === id ? 'page' : undefined}
            className={cn(
              'group/nav relative isolate flex items-center gap-2.5 overflow-hidden rounded-md px-2.5 py-2 text-sm transition-colors',
              page === id ? 'text-fg' : 'text-fg-muted hover:text-fg'
            )}
          >
            <motion.span
              aria-hidden
              className="pointer-events-none absolute inset-y-1 -left-12 w-12 bg-accent/20"
              variants={NAV_SWEEP_VARIANTS}
            />
            {page === id && (
              <>
                <motion.span
                  layoutId="active-nav"
                  className="absolute inset-0 rounded-md bg-bg-hover"
                  transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                />
                <motion.span
                  layoutId="active-nav-rail"
                  className="absolute left-1 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-accent"
                  transition={{ type: 'spring', stiffness: 520, damping: 36 }}
                />
              </>
            )}
            <Icon className="relative" size={16} />
            <span className="relative">{label}</span>
          </motion.button>
        ))}
      </motion.nav>

      <main className="relative flex-1 overflow-y-auto">
        <AnimatePresence mode="wait">
          <motion.section
            key={page}
            className="relative h-full min-h-full"
            initial={prefersReducedMotion ? false : { opacity: 0, y: 8, scale: 0.995 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: -6, scale: 0.995 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
          >
            <motion.div
              className="pointer-events-none absolute inset-x-0 top-0 z-10 h-px origin-left bg-accent"
              initial={{ opacity: 0.7, scaleX: 0 }}
              animate={{ opacity: 0, scaleX: 1 }}
              transition={{ duration: 0.44, ease: 'easeOut' }}
            />
            {renderPage()}
          </motion.section>
        </AnimatePresence>
      </main>

      {/* Global star-collect ring — persists across all pages (PRD: 全局累计 + 固定悬浮) */}
      <StarRing />
    </div>
  )
}
