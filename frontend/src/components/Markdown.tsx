import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { X } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import { useState } from 'react'
import { cn } from '@/lib/utils'

interface Props extends React.ComponentPropsWithoutRef<'div'> {
  children: string
  onLinkClick?: (href: string) => boolean
}

export function Markdown({ children, className, onLinkClick, ...rest }: Props) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  return (
    <>
      <div className={cn('prose prose-sm prose-invert max-w-none text-fg', className)} {...rest}>
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            strong: ({ children: c, ...p }) => (
              <strong className="text-accent font-semibold" {...p}>{c}</strong>
            ),
            blockquote: ({ children: c, ...p }) => (
              <blockquote className="border-l-2 border-accent/60 bg-accent/5 pl-3 py-1 my-2 italic text-fg-muted not-italic" {...p}>{c}</blockquote>
            ),
            h2: ({ children: c, ...p }) => (
              <h2 className="text-sm font-semibold text-fg mt-3 mb-1.5" {...p}>{c}</h2>
            ),
            h3: ({ children: c, ...p }) => (
              <h3 className="text-sm font-semibold text-fg mt-2 mb-1" {...p}>{c}</h3>
            ),
            ul: ({ children: c, ...p }) => (
              <ul className="list-disc list-inside space-y-1" {...p}>{c}</ul>
            ),
            ol: ({ children: c, ...p }) => (
              <ol className="list-decimal list-inside space-y-1" {...p}>{c}</ol>
            ),
            p: ({ children: c, ...p }) => (
              <p className="my-0.5 leading-relaxed" {...p}>{c}</p>
            ),
            a: ({ children: c, href, ...p }) => (
              <a
                href={href}
                className="font-medium text-accent underline decoration-accent/40 underline-offset-4 hover:text-accent-hover"
                onClick={(event) => {
                  if (!href) return
                  if (onLinkClick?.(href)) {
                    event.preventDefault()
                    return
                  }
                  event.preventDefault()
                  setPreviewUrl(href)
                }}
                {...p}
              >
                {c}
              </a>
            ),
          }}
        >
          {children}
        </ReactMarkdown>
      </div>
      <AnimatePresence>
        {previewUrl && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[120] flex items-center justify-center bg-black/55 px-8 py-7 backdrop-blur-md"
            onClick={() => setPreviewUrl(null)}
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
                <p className="min-w-0 flex-1 truncate text-xs text-fg-muted">{previewUrl}</p>
                <button
                  type="button"
                  onClick={() => setPreviewUrl(null)}
                  className="rounded-md p-1.5 text-fg-muted transition-colors hover:bg-bg-hover hover:text-fg"
                  aria-label="关闭网页预览"
                >
                  <X size={15} />
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-hidden bg-white">
                <iframe
                  src={previewUrl}
                  title="网页预览"
                  className="h-full w-[calc(100%+18px)] border-0 bg-white"
                />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
