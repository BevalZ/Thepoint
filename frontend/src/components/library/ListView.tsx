import type { AppConfig, StoredPoint } from '@/api/types'
import { PointTree } from '@/components/PointTree'

type UiLanguage = AppConfig['uiLanguage']

interface Props {
  points: StoredPoint[]
  onArchive: (id: string) => void
  onOpenSource?: (point: StoredPoint) => void
  onOpenEvidenceSource?: (sourceId: string, chunkIndex: number | null) => void
  language?: UiLanguage
}

export function ListView({ points, onArchive, onOpenSource, onOpenEvidenceSource, language = 'zh-CN' }: Props) {
  const roots = points.filter(p => !p.parentId)
  return (
    <div className="pb-6">
      <PointTree points={[...roots, ...points.filter(p => p.parentId)]} onArchive={onArchive} onOpenSource={onOpenSource} onOpenEvidenceSource={onOpenEvidenceSource} language={language} />
    </div>
  )
}
