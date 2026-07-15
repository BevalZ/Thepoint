import type { AppConfig, StoredPoint } from '@/api/types'
import { Archive, LocateFixed } from 'lucide-react'
import { SourceExcerptButton } from '@/components/SourceExcerptButton'
import { PointEvidence } from '@/components/EvidenceList'

const COLUMNS = ['事实陈述', '作者观点', '待验证疑问', '其他']
type UiLanguage = AppConfig['uiLanguage']

function isZh(language: UiLanguage): boolean {
  return language !== 'en-US'
}

function copy(language: UiLanguage, zh: string, en: string): string {
  return isZh(language) ? zh : en
}

function columnLabel(column: string, language: UiLanguage): string {
  const en: Record<string, string> = {
    事实陈述: 'Facts',
    作者观点: 'Author views',
    待验证疑问: 'Questions',
    其他: 'Other',
  }
  return isZh(language) ? column : en[column] ?? column
}

interface Props {
  points: StoredPoint[]
  onArchive: (id: string) => void
  onOpenSource?: (point: StoredPoint) => void
  onOpenEvidenceSource?: (sourceId: string, chunkIndex: number | null) => void
  language?: UiLanguage
}

export function KanbanView({ points, onArchive, onOpenSource, onOpenEvidenceSource, language = 'zh-CN' }: Props) {
  const roots = points.filter(p => !p.parentId)
  const byTag = (tag: string) =>
    roots.filter(p => tag === '其他' ? !p.tagType || !COLUMNS.slice(0, 3).includes(p.tagType) : p.tagType === tag)

  return (
    <div className="flex gap-3 pb-6 overflow-x-auto">
      {COLUMNS.map(col => {
        const items = byTag(col)
        return (
          <div key={col} className="flex-1 min-w-[180px]">
            <div className="flex items-center justify-between mb-2 px-1">
              <span className="text-xs font-medium text-fg-muted">{columnLabel(col, language)}</span>
              <span className="text-xs text-fg-faint">{items.length}</span>
            </div>
            <div className="space-y-2">
              {items.map(p => (
                <div key={p.id} className="perf-content-auto rounded-lg border border-border bg-bg-elevated p-3 text-sm text-fg leading-relaxed group">
                  <p className="line-clamp-4">{p.content}</p>
                  <PointEvidence pointId={p.id} language={language} className="mt-2" onOpenSource={onOpenEvidenceSource} />
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-xs text-fg-faint truncate">{p.sourceDocName ?? '—'}</span>
                    <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                      <SourceExcerptButton
                        point={p}
                        language={language}
                        className="p-0.5 rounded text-fg-faint hover:text-accent transition-colors"
                      />
                      {onOpenSource && (
                        <button
                          onClick={() => onOpenSource(p)}
                          className="p-0.5 rounded text-fg-faint hover:text-accent transition-colors"
                          title={copy(language, '定位来源', 'Locate source')}
                        >
                          <LocateFixed size={12} />
                        </button>
                      )}
                      <button onClick={() => onArchive(p.id)}
                        className="p-0.5 rounded text-fg-faint hover:text-fg-muted transition-colors"
                        title={copy(language, '归档', 'Archive')}>
                        <Archive size={12} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
