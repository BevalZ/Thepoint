import { create } from 'zustand'

export interface SynthesisSourceSelection {
  id: string
  title: string
}

interface SynthesisStore {
  sources: SynthesisSourceSelection[]
  addSource: (source: SynthesisSourceSelection) => void
  removeSource: (id: string) => void
  toggleSource: (source: SynthesisSourceSelection) => void
  clearSources: () => void
  hasSource: (id: string) => boolean
}

export const useSynthesisStore = create<SynthesisStore>((set, get) => ({
  sources: [],
  addSource: (source) =>
    set((state) => (
      state.sources.some((existing) => existing.id === source.id)
        ? state
        : { sources: [source, ...state.sources] }
    )),
  removeSource: (id) =>
    set((state) => ({ sources: state.sources.filter((source) => source.id !== id) })),
  toggleSource: (source) => {
    if (get().hasSource(source.id)) {
      get().removeSource(source.id)
    } else {
      get().addSource(source)
    }
  },
  clearSources: () => set({ sources: [] }),
  hasSource: (id) => get().sources.some((source) => source.id === id),
}))
