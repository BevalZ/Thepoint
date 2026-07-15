import type { AppConfig, StoredPoint } from '@/api/types'
import { Archive, LocateFixed } from 'lucide-react'
import { SourceExcerptButton } from '@/components/SourceExcerptButton'

type UiLanguage = AppConfig['uiLanguage']

function isZh(language: UiLanguage): boolean {
  return language !== 'en-US'
}

function copy(language: UiLanguage, zh: string, en: string): string {
  return isZh(language) ? zh : en
}

interface Props {
  points: StoredPoint[]
  onArchive: (id: string) => void
  onOpenSource?: (point: StoredPoint) => void
  language?: UiLanguage
}

export function TableView({ points, onArchive, onOpenSource, language = 'zh-CN' }: Props) {
  const roots = points.filter(p => !p.parentId)
  return (
    <div className="pb-6 overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b border-border text-fg-muted text-left">
            <th className="py-2 pr-4 font-medium w-1/2">{copy(language, '内容', 'Content')}</th>
            <th className="py-2 pr-4 font-medium">{copy(language, '来源', 'Source')}</th>
            <th className="py-2 pr-4 font-medium">{copy(language, '标签', 'Tag')}</th>
            <th className="py-2 pr-4 font-medium">{copy(language, '时间', 'Time')}</th>
            <th className="py-2 font-medium w-8" />
          </tr>
        </thead>
        <tbody>
          {roots.map(p => (
            <tr key={p.id} className="border-b border-border/50 hover:bg-bg-elevated transition-colors">
              <td className="py-2 pr-4 text-fg leading-relaxed">{p.content}</td>
              <td className="py-2 pr-4 text-fg-muted truncate max-w-[140px]">{p.sourceDocName ?? '—'}</td>
              <td className="py-2 pr-4 text-fg-faint text-xs">{p.tagType ?? '—'}</td>
              <td className="py-2 pr-4 text-fg-faint text-xs whitespace-nowrap">{p.createdAt.slice(0, 10)}</td>
              <td className="py-2">
                <div className="flex items-center gap-1">
                <SourceExcerptButton
                  point={p}
                  language={language}
                  className="p-1 rounded text-fg-faint hover:text-accent transition-colors"
                />
                {onOpenSource && (
                  <button
                    onClick={() => onOpenSource(p)}
                    className="p-1 rounded text-fg-faint hover:text-accent transition-colors"
                    title={copy(language, '定位来源', 'Locate source')}
                  >
                    <LocateFixed size={13} />
                  </button>
                )}
                <button onClick={() => onArchive(p.id)} className="p-1 rounded text-fg-faint hover:text-fg-muted transition-colors" title={copy(language, '归档', 'Archive')}>
                  <Archive size={13} />
                </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
