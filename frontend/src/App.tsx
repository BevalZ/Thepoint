import { useEffect, useState } from 'react'
import { BarChart2, Compass, Settings as SettingsIcon, Library as LibraryIcon } from 'lucide-react'
import Settings from '@/pages/Settings'
import Explore from '@/pages/Explore'
import Library from '@/pages/Library'
import Analytics from '@/pages/Analytics'
// TODO(gallery): re-enable when AI gallery feature is ready for release
// import Gallery from '@/pages/Gallery'
// import { Image } from 'lucide-react'
import { StarRing } from '@/components/StarRing'
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

export default function App() {
  const [page, setPage] = useState<Page>('explore')
  const { loaded, fetchConfig } = useConfigStore()
  useThemeStore()

  useEffect(() => {
    if (!loaded) fetchConfig()
  }, [loaded, fetchConfig])

  return (
    <div className="flex h-screen">
      <nav className="flex w-52 flex-col border-r border-border bg-bg-elevated px-3 py-5">
        <div className="px-2 pb-5 text-sm font-semibold tracking-tight">
          Deep Explorer
        </div>
        {NAV.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setPage(id)}
            className={cn(
              'flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors',
              page === id ? 'bg-bg-hover text-fg' : 'text-fg-muted hover:bg-bg-hover hover:text-fg'
            )}
          >
            <Icon size={16} />{label}
          </button>
        ))}
      </nav>

      <main className="flex-1 overflow-y-auto">
        {page === 'settings' ? <Settings />
          : page === 'library' ? <Library />
          : page === 'analytics' ? <Analytics />
          // TODO(gallery): : page === 'gallery' ? <Gallery />
          : <Explore />
        }
      </main>

      {/* Global star-collect ring — persists across all pages (PRD: 全局累计 + 固定悬浮) */}
      <StarRing />
    </div>
  )
}
