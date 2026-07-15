import { create } from 'zustand'

export type ThemeMode = 'dark' | 'light' | 'system'
export type FontSize = 'sm' | 'md' | 'lg'

const ACCENT_PRESETS = ['#6366f1','#ec4899','#f97316','#22c55e','#06b6d4','#a855f7']

const LS_THEME      = 'app-theme-mode'
const LS_ACCENT     = 'app-accent-color'
const LS_UI_FONT    = 'app-ui-font'
const LS_FONT_SIZE  = 'app-font-size'
const LS_CODE_FONT  = 'app-code-font'

export const UI_FONTS = [
  { key: 'noto',   label: 'Noto Serif SC', value: "'Noto Serif SC', system-ui, sans-serif" },
  { key: 'monaco', label: 'Monaco',        value: "'Monaco', system-ui, sans-serif" },
  { key: 'system', label: '系统默认',      value: 'system-ui, -apple-system, sans-serif' },
] as const
export type UiFontKey = typeof UI_FONTS[number]['key']

export const CODE_FONTS = [
  { key: 'monaco',  label: 'Monaco',          value: "'Monaco', ui-monospace, monospace" },
  { key: 'jetbrains', label: 'JetBrains Mono', value: "'JetBrains Mono', ui-monospace, monospace" },
  { key: 'fira',    label: 'Fira Code',        value: "'Fira Code', ui-monospace, monospace" },
  { key: 'system',  label: '系统默认',         value: 'ui-monospace, monospace' },
] as const
export type CodeFontKey = typeof CODE_FONTS[number]['key']

const FONT_SIZE_MAP: Record<FontSize, string> = { sm: '13px', md: '15px', lg: '17px' }

interface ThemeStore {
  mode: ThemeMode
  accent: string
  accentPresets: string[]
  uiFont: UiFontKey
  codeFont: CodeFontKey
  fontSize: FontSize
  setMode:      (mode: ThemeMode)    => void
  setAccent:    (color: string)      => void
  setUiFont:    (key: UiFontKey)     => void
  setCodeFont:  (key: CodeFontKey)   => void
  setFontSize:  (size: FontSize)     => void
}

function resolveMode(mode: ThemeMode): 'light' | 'dark' {
  if (mode !== 'system') return mode
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

function applyTheme(mode: ThemeMode, accent: string, uiFont: UiFontKey, codeFont: CodeFontKey, fontSize: FontSize) {
  const root = document.documentElement
  if (resolveMode(mode) === 'light') root.classList.add('light')
  else root.classList.remove('light')
  root.style.setProperty('--color-accent', accent)
  root.style.setProperty('--font-ui', UI_FONTS.find(f => f.key === uiFont)!.value)
  root.style.setProperty('--font-code', CODE_FONTS.find(f => f.key === codeFont)!.value)
  root.style.setProperty('--font-size-base', FONT_SIZE_MAP[fontSize])
}

export const useThemeStore = create<ThemeStore>((set) => {
  const mode     = (localStorage.getItem(LS_THEME)     ?? 'dark')   as ThemeMode
  const accent   =  localStorage.getItem(LS_ACCENT)    ?? '#6366f1'
  const uiFont   = (localStorage.getItem(LS_UI_FONT)   ?? 'system') as UiFontKey
  const codeFont = (localStorage.getItem(LS_CODE_FONT) ?? 'monaco') as CodeFontKey
  const fontSize = (localStorage.getItem(LS_FONT_SIZE) ?? 'md')     as FontSize
  applyTheme(mode, accent, uiFont, codeFont, fontSize)

  window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
    const s = useThemeStore.getState()
    if (s.mode === 'system') applyTheme('system', s.accent, s.uiFont, s.codeFont, s.fontSize)
  })

  return {
    mode, accent, uiFont, codeFont, fontSize,
    accentPresets: ACCENT_PRESETS,
    setMode: (mode) => {
      localStorage.setItem(LS_THEME, mode); set({ mode })
      const s = useThemeStore.getState()
      applyTheme(mode, s.accent, s.uiFont, s.codeFont, s.fontSize)
    },
    setAccent: (accent) => {
      localStorage.setItem(LS_ACCENT, accent); set({ accent })
      const s = useThemeStore.getState()
      applyTheme(s.mode, accent, s.uiFont, s.codeFont, s.fontSize)
    },
    setUiFont: (uiFont) => {
      localStorage.setItem(LS_UI_FONT, uiFont); set({ uiFont })
      const s = useThemeStore.getState()
      applyTheme(s.mode, s.accent, uiFont, s.codeFont, s.fontSize)
    },
    setCodeFont: (codeFont) => {
      localStorage.setItem(LS_CODE_FONT, codeFont); set({ codeFont })
      const s = useThemeStore.getState()
      applyTheme(s.mode, s.accent, s.uiFont, codeFont, s.fontSize)
    },
    setFontSize: (fontSize) => {
      localStorage.setItem(LS_FONT_SIZE, fontSize); set({ fontSize })
      const s = useThemeStore.getState()
      applyTheme(s.mode, s.accent, s.uiFont, s.codeFont, fontSize)
    },
  }
})
