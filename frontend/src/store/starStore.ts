import { create } from 'zustand'
import type { StoredPoint } from '@/api/types'
import { listStarredPoints, starPoint, unstarPoint } from '@/api'

interface StarStore {
  count: number
  points: StoredPoint[]
  init: () => Promise<void>
  star: (pointId: string) => Promise<void>
  unstar: (pointId: string) => Promise<void>
  clear: () => Promise<void>
}

export const useStarStore = create<StarStore>((set, get) => ({
  count: 0,
  points: [],
  init: async () => {
    const points = await listStarredPoints()
    set({ count: points.length, points })
  },
  star: async (pointId) => {
    const count = await starPoint(pointId)
    const points = await listStarredPoints()
    set({ count, points })
  },
  unstar: async (pointId) => {
    const count = await unstarPoint(pointId)
    const points = await listStarredPoints()
    set({ count, points })
  },
  clear: async () => {
    const points = [...get().points]
    for (const point of points) {
      await unstarPoint(point.id)
    }
    set({ count: 0, points: [] })
  },
}))
