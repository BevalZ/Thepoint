import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { cn } from '@/lib/utils'

interface Props extends React.ComponentPropsWithoutRef<'div'> {
  children: string
  onLinkClick?: (href: string) => boolean
}

export function Markdown({ children, className, onLinkClick, ...rest }: Props) {
  return (
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
                }
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
  )
}
