import { create } from 'zustand'
import type { EvidenceRecord } from '@/api/types'

interface EvidenceDigestStore {
  records: EvidenceRecord[]
  add: (record: EvidenceRecord) => void
  remove: (id: string) => void
  toggle: (record: EvidenceRecord) => void
  clear: () => void
  has: (id: string) => boolean
}

export const useEvidenceDigestStore = create<EvidenceDigestStore>((set, get) => ({
  records: [],
  add: (record) =>
    set((state) => (
      state.records.some((existing) => existing.id === record.id)
        ? state
        : { records: [record, ...state.records] }
    )),
  remove: (id) =>
    set((state) => ({ records: state.records.filter((record) => record.id !== id) })),
  toggle: (record) => {
    if (get().has(record.id)) {
      get().remove(record.id)
    } else {
      get().add(record)
    }
  },
  clear: () => set({ records: [] }),
  has: (id) => get().records.some((record) => record.id === id),
}))
