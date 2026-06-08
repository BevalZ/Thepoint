import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'

interface ExternalLinkPreviewProps {
  url: string | null
  onClose: () => void
}

export function ExternalLinkPreview({ url, onClose }: ExternalLinkPreviewProps) {
  return (
    <AnimatePresence>
      {url && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/55 px-8 py-7 backdrop-blur-md"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, y: 14, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 320, damping: 30 }}
            className="flex h-[min(82vh,860px)] w-[min(86vw,1120px)] flex-col overflow-hidden rounded-xl border border-border bg-bg-elevated shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center gap-3 border-b border-border px-4 py-2.5">
              <p className="min-w-0 flex-1 truncate text-xs text-fg-muted">{url}</p>
              <button
                type="button"
                onClick={onClose}
                className="rounded-md p-1.5 text-fg-muted transition-colors hover:bg-bg-hover hover:text-fg"
                aria-label="关闭网页预览"
              >
                <X size={15} />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-hidden bg-white">
              <iframe
                src={url}
                title="网页预览"
                className="h-full w-[calc(100%+18px)] border-0 bg-white"
              />
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
