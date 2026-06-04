import { useState } from 'react'
import { Compass, Settings as SettingsIcon } from 'lucide-react'
import Settings from '@/pages/Settings'
import { cn } from '@/lib/utils'

type Page = 'explore' | 'settings'

const NAV: { id: Page; label: string; icon: typeof Compass }[] = [
  { id: 'explore', label: '探索', icon: Compass },
  { id: 'settings', label: '设置', icon: SettingsIcon },
]

export default function App() {
  const [page, setPage] = useState<Page>('explore')

  return (
    <div className="flex h-screen">
      <nav className="flex w-52 flex-col border-r border-border bg-bg-elevated px-3 py-5">
        <div className="px-2 pb-5 text-sm font-semibold tracking-tight">
          Deep Explorer
        </div>
        {NAV.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setPage(id)}
            className={cn(
              'flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors',
              page === id
                ? 'bg-bg-hover text-fg'
                : 'text-fg-muted hover:bg-bg-hover hover:text-fg'
            )}
          >
            <Icon size={16} />
            {label}
          </button>
        ))}
      </nav>

      <main className="flex-1 overflow-y-auto">
        {page === 'settings' ? (
          <Settings />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-fg-faint">
            探索页 — 即将开发
          </div>
        )}
      </main>
    </div>
  )
}
