import { Suspense, lazy, useCallback, useEffect, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { AnimatePresence, motion, useReducedMotion, type Variants } from 'framer-motion'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { BarChart2, ChevronDown, Compass, HelpCircle, Image, Settings as SettingsIcon, Library as LibraryIcon, Maximize2, Minus, Sparkles, X } from 'lucide-react'
import { StarRing } from '@/components/StarRing'
import { StartupSplash } from '@/components/StartupSplash'
import { StarfieldBackground } from '@/components/StarfieldBackground'
import { useConfigStore, useExploreStore, useThemeStore } from '@/store'
import { cn } from '@/lib/utils'
import { getPointSourceContext } from '@/api'

const Settings = lazy(() => import('@/pages/Settings'))
const Explore = lazy(() => import('@/pages/Explore'))
const Library = lazy(() => import('@/pages/Library'))
const Analytics = lazy(() => import('@/pages/Analytics'))
const Gallery = lazy(() => import('@/pages/Gallery'))

type Page = 'explore' | 'library' | 'gallery' | 'analytics' | 'settings'

const NAV: { id: Page; label: string; icon: typeof Compass }[] = [
  { id: 'explore', label: '探索', icon: Compass },
  { id: 'library', label: '知识库', icon: LibraryIcon },
  { id: 'gallery', label: '画廊', icon: Image },
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

function UsageGuide({ open }: { open: boolean }) {
  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.div
          initial={{ opacity: 0, y: -6, height: 0 }}
          animate={{ opacity: 1, y: 0, height: 'auto' }}
          exit={{ opacity: 0, y: -6, height: 0 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
          className="overflow-hidden"
        >
          <div className="ml-2 mt-1.5 border-l border-border/70 pl-2.5 pr-1 text-[11px] leading-snug text-fg-muted">
            <p><span className="font-medium text-fg">探索：</span>粘贴/拖拽/抓取网页，拆块解析。</p>
            <p className="mt-1"><span className="font-medium text-fg">星星：</span>点击看解读，右键采集到圆环生成研报。</p>
            <p className="mt-1"><span className="font-medium text-fg">评论员：</span>先选数字分身，再生成辣评。</p>
            <p className="mt-1"><span className="font-medium text-fg">事实审查：</span>划词调用搜索模型核查并保存。</p>
            <p className="mt-1"><span className="font-medium text-fg">知识库：</span>按来源归档，记录旁查看段原文。</p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

function AppTitleBar() {
  const [maximized, setMaximized] = useState(false)
  const tauriRuntime = isTauriRuntime()

  useEffect(() => {
    if (!tauriRuntime) return
    void getCurrentWindow().isMaximized().then(setMaximized).catch(() => undefined)
  }, [tauriRuntime])

  const handleDrag = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (!tauriRuntime || event.button !== 0) return
    if (event.detail > 1) return
    void getCurrentWindow().startDragging().catch(() => undefined)
  }, [tauriRuntime])

  const handleMinimize = useCallback(() => {
    if (!tauriRuntime) return
    void getCurrentWindow().minimize().catch(() => undefined)
  }, [tauriRuntime])

  const handleToggleMaximize = useCallback(async () => {
    if (!tauriRuntime) return
    const appWindow = getCurrentWindow()
    await appWindow.toggleMaximize().catch(() => undefined)
    await appWindow.isMaximized().then(setMaximized).catch(() => undefined)
  }, [tauriRuntime])

  const handleClose = useCallback(() => {
    if (!tauriRuntime) return
    void getCurrentWindow().close().catch(() => undefined)
  }, [tauriRuntime])

  return (
    <div className="relative z-[80] flex h-11 shrink-0 select-none items-center border-b border-border-strong bg-bg-elevated text-fg shadow-[0_1px_0_var(--color-border)]">
      <div
        className="flex h-full min-w-0 flex-1 cursor-default items-center gap-2 px-3"
        onPointerDown={handleDrag}
        onDoubleClick={handleToggleMaximize}
        data-tauri-drag-region
      >
        <div className="relative flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-accent/35 bg-accent/10 text-accent">
          <Sparkles size={12} />
          <span className="pointer-events-none absolute inset-0 rounded-md border border-accent/20" />
        </div>
      </div>
      <div className="flex h-full shrink-0 items-center border-l border-border-strong bg-bg-elevated">
        <button
          type="button"
          onClick={handleMinimize}
          className="flex h-full w-11 items-center justify-center text-fg-muted transition-colors hover:bg-bg-hover hover:text-fg"
          title="最小化"
        >
          <Minus size={14} />
        </button>
        <button
          type="button"
          onClick={handleToggleMaximize}
          className="flex h-full w-11 items-center justify-center text-fg-muted transition-colors hover:bg-bg-hover hover:text-fg"
          title={maximized ? '还原' : '最大化'}
        >
          <Maximize2 size={13} />
        </button>
        <button
          type="button"
          onClick={handleClose}
          className="flex h-full w-11 items-center justify-center text-fg-muted transition-colors hover:bg-red-500/80 hover:text-white"
          title="关闭"
        >
          <X size={15} />
        </button>
      </div>
    </div>
  )
}

export default function App() {
  const [page, setPage] = useState<Page>('explore')
  const [showSplash, setShowSplash] = useState(true)
  const [usageOpen, setUsageOpen] = useState(false)
  const prefersReducedMotion = useReducedMotion()
  const { loaded, fetchConfig } = useConfigStore()
  const openSourceById = useExploreStore((state) => state.openSourceById)
  useThemeStore()

  useEffect(() => {
    if (!loaded) fetchConfig()
  }, [loaded, fetchConfig])

  const handleSplashComplete = useCallback(() => setShowSplash(false), [])

  const handleOpenSource = useCallback(async (sourceId: string, focusChunkIndex: number | null = null) => {
    const opened = await openSourceById(sourceId, focusChunkIndex)
    if (opened) setPage('explore')
  }, [openSourceById])

  const handleOpenPointSource = useCallback(async (pointId: string) => {
    const context = await getPointSourceContext(pointId)
    if (!context) return
    const opened = await openSourceById(context.source.id, context.chunkIndex)
    if (opened) setPage('explore')
  }, [openSourceById])

  const renderPage = () => {
    if (page === 'settings') return <Settings />
    if (page === 'library') return <Library onOpenPointSource={handleOpenPointSource} onOpenSource={handleOpenSource} />
    if (page === 'gallery') return <Gallery />
    if (page === 'analytics') return <Analytics />
    return <Explore />
  }

  return (
    <div className="relative flex h-screen flex-col overflow-hidden bg-bg text-fg ring-1 ring-inset ring-border-strong">
      <StarfieldBackground />
      <AnimatePresence>
        {showSplash && <StartupSplash onComplete={handleSplashComplete} />}
      </AnimatePresence>

      <AppTitleBar />

      <div className="relative z-10 flex min-h-0 flex-1 overflow-hidden">
        <motion.nav
          className="flex w-52 shrink-0 flex-col border-r border-border bg-bg-elevated px-3 py-5"
          initial={prefersReducedMotion ? false : { opacity: 0, x: -14 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.28, ease: 'easeOut' }}
        >
          {NAV.map(({ id, label, icon: Icon }) => (
            <div key={id}>
              <motion.button
                onClick={() => setPage(id)}
                variants={NAV_ITEM_VARIANTS}
                initial="rest"
                whileHover={prefersReducedMotion ? undefined : 'hover'}
                whileTap={prefersReducedMotion ? undefined : { scale: 0.98 }}
                aria-current={page === id ? 'page' : undefined}
                className={cn(
                  'group/nav relative isolate flex w-full items-center gap-2.5 overflow-hidden rounded-md px-2.5 py-2 text-sm transition-colors',
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
              {id === 'settings' && (
                <div>
                  <motion.button
                    type="button"
                    onClick={() => setUsageOpen(value => !value)}
                    variants={NAV_ITEM_VARIANTS}
                    initial="rest"
                    whileHover={prefersReducedMotion ? undefined : 'hover'}
                    whileTap={prefersReducedMotion ? undefined : { scale: 0.98 }}
                    className={cn(
                      'group/nav relative isolate mt-1 flex w-full items-center gap-2.5 overflow-hidden rounded-md px-2.5 py-2 text-sm transition-colors',
                      usageOpen ? 'text-fg' : 'text-fg-muted hover:text-fg'
                    )}
                  >
                    <motion.span
                      aria-hidden
                      className="pointer-events-none absolute inset-y-1 -left-12 w-12 bg-accent/20"
                      variants={NAV_SWEEP_VARIANTS}
                    />
                    {usageOpen && (
                      <motion.span
                        layoutId="active-usage-guide"
                        className="absolute inset-0 rounded-md bg-bg-hover"
                        transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                      />
                    )}
                    <HelpCircle className="relative" size={16} />
                    <span className="relative min-w-0 flex-1 text-left">使用说明</span>
                    <ChevronDown size={13} className={cn('relative transition-transform', usageOpen && 'rotate-180')} />
                  </motion.button>
                  <UsageGuide open={usageOpen} />
                </div>
              )}
            </div>
          ))}
        </motion.nav>

        <main className="relative min-w-0 flex-1 overflow-y-auto">
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
              <Suspense
                fallback={(
                  <div className="flex h-full min-h-full items-center justify-center text-sm text-fg-faint">
                    加载页面…
                  </div>
                )}
              >
                {renderPage()}
              </Suspense>
            </motion.section>
          </AnimatePresence>
        </main>
      </div>

      {/* Global star-collect ring — persists across all pages (PRD: 全局累计 + 固定悬浮) */}
      <StarRing onNavigateGallery={() => setPage('gallery')} onOpenSource={handleOpenSource} />
    </div>
  )
}
