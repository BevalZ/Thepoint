import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { FileText, X } from 'lucide-react'
import type { AppConfig, StoredPoint } from '@/api/types'

type UiLanguage = AppConfig['uiLanguage']

function isZh(language: UiLanguage): boolean {
  return language !== 'en-US'
}

function copy(language: UiLanguage, zh: string, en: string): string {
  return isZh(language) ? zh : en
}

interface SourceExcerptButtonProps {
  point: StoredPoint
  language?: UiLanguage
  className?: string
}

export function SourceExcerptButton({ point, language = 'zh-CN', className }: SourceExcerptButtonProps) {
  const [open, setOpen] = useState(false)
  const excerpt = point.sourceExcerpt?.trim()

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={copy(language, '查看段原文', 'View source excerpt')}
        aria-label={copy(language, '查看段原文', 'View source excerpt')}
        className={className}
      >
        <FileText size={14} />
      </button>
      <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[95] bg-black/30 backdrop-blur-sm"
              onClick={() => setOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, y: 12, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.97 }}
              transition={{ type: 'spring', stiffness: 320, damping: 28 }}
              className="fixed left-1/2 top-1/2 z-[96] flex max-h-[72vh] w-[min(620px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl border border-border bg-bg-elevated shadow-2xl"
            >
              <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-fg">{copy(language, '段原文', 'Source excerpt')}</p>
                  <p className="mt-0.5 truncate text-xs text-fg-faint">
                    {point.sourceDocName ?? copy(language, '本地缓存', 'Local cache')}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-md p-1 text-fg-muted transition-colors hover:bg-bg-hover hover:text-fg"
                  aria-label={copy(language, '关闭', 'Close')}
                >
                  <X size={15} />
                </button>
              </div>
              <div className="overflow-y-auto px-4 py-3">
                {excerpt ? (
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-fg">
                    {excerpt}
                  </p>
                ) : (
                  <p className="text-sm leading-relaxed text-fg-muted">
                    {copy(
                      language,
                      '这条记录创建时还没有保存段原文；之后从探索页采集的记录会保留本地原文缓存。',
                      'This record does not have a saved excerpt. Records collected from Explore later will keep a local source-text cache.'
                    )}
                  </p>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  )
}
