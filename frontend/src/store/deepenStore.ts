import { create } from 'zustand'
import type { FrameworkRecommendation, MentalModel, StoredPoint } from '@/api/types'
import { listMentalModels, recommendFrameworks } from '@/api'

interface DeepenStore {
  mentalModels: MentalModel[]
  modelsLoaded: boolean
  recommendations: Record<string, FrameworkRecommendation[]>
  recommending: Record<string, boolean>
  fetchMentalModels: () => Promise<void>
  fetchRecommendations: (point: StoredPoint) => Promise<void>
}

export const useDeepenStore = create<DeepenStore>((set, get) => ({
  mentalModels: [],
  modelsLoaded: false,
  recommendations: {},
  recommending: {},
  fetchMentalModels: async () => {
    try {
      const mentalModels = await listMentalModels()
      set({ mentalModels, modelsLoaded: true })
    } catch {
      // non-fatal: the "其他" panel just stays empty
    }
  },
  fetchRecommendations: async (point) => {
    if (get().recommending[point.id]) return
    set((s) => ({
      recommending: { ...s.recommending, [point.id]: true },
    }))
    try {
      const recs = await recommendFrameworks(point.content)
      set((s) => ({
        recommendations: { ...s.recommendations, [point.id]: recs },
        recommending: { ...s.recommending, [point.id]: false },
      }))
    } catch {
      set((s) => ({
        recommending: { ...s.recommending, [point.id]: false },
      }))
    }
  },
}))
