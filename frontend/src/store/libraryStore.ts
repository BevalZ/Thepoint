import { create } from 'zustand'
import type { DeepenAction, StoredPoint } from '@/api/types'
import {
  archivePoint,
  deepenPoint,
  deletePoint,
  findSimilar,
  listArchivedPoints,
  listPoints,
  saveFactCheckPoint,
  saveManualPoint,
  unarchivePoint,
} from '@/api'
import { useStarStore } from './starStore'

interface LibraryStore {
  points: StoredPoint[]
  archivedPoints: StoredPoint[]
  loading: boolean
  error: string | null
  deepening: Record<string, boolean>
  expanded: Record<string, boolean>
  similar: Record<string, StoredPoint[]>
  fetch: () => Promise<void>
  fetchArchived: () => Promise<void>
  archivePoint: (id: string) => Promise<void>
  unarchivePoint: (id: string) => Promise<void>
  toggleExpanded: (pointId: string) => void
  deepen: (point: StoredPoint, action: DeepenAction, frameworkKey?: string) => Promise<void>
  addManualThought: (point: StoredPoint, content: string) => Promise<void>
  addFactCheck: (point: StoredPoint, content: string) => Promise<void>
  findSimilarFor: (point: StoredPoint) => Promise<StoredPoint[]>
  deletePoint: (id: string) => Promise<void>
  archiveMany: (ids: string[]) => Promise<void>
  deleteMany: (rootIds: string[]) => Promise<void>
}

function errorMessage(e: unknown): string {
  if (typeof e === 'string') return e
  if (e instanceof Error) return e.message
  return '发生未知错误'
}

function collectSubtreeIds(points: StoredPoint[], rootIds: string[]): Set<string> {
  const ids = new Set<string>()
  const collect = (targetId: string) => {
    ids.add(targetId)
    for (const p of points) if (p.parentId === targetId) collect(p.id)
  }
  rootIds.forEach(collect)
  return ids
}

export const useLibraryStore = create<LibraryStore>((set, get) => ({
  points: [],
  archivedPoints: [],
  loading: false,
  error: null,
  deepening: {},
  expanded: {},
  similar: {},
  fetch: async () => {
    set({ loading: true, error: null })
    try {
      const points = await listPoints()
      set({ points, loading: false })
    } catch (e) {
      set({ loading: false, error: errorMessage(e) })
    }
  },
  fetchArchived: async () => {
    try {
      const archivedPoints = await listArchivedPoints()
      set({ archivedPoints })
    } catch (e) {
      set({ error: errorMessage(e) })
    }
  },
  archivePoint: async (id) => {
    await archivePoint(id)
    set((s) => ({ points: s.points.filter(p => p.id !== id) }))
  },
  unarchivePoint: async (id) => {
    await unarchivePoint(id)
    set((s) => ({ archivedPoints: s.archivedPoints.filter(p => p.id !== id) }))
  },
  toggleExpanded: (pointId) =>
    set((s) => ({
      expanded: { ...s.expanded, [pointId]: !s.expanded[pointId] },
    })),
  deepen: async (point, action, frameworkKey) => {
    if (get().deepening[point.id]) return
    set((s) => ({
      deepening: { ...s.deepening, [point.id]: true },
      error: null,
    }))
    try {
      const children = await deepenPoint(
        point.id,
        point.content,
        action,
        frameworkKey ?? null
      )
      set((s) => ({
        points: [...s.points, ...children],
        expanded: { ...s.expanded, [point.id]: true },
        deepening: { ...s.deepening, [point.id]: false },
      }))
    } catch (e) {
      set((s) => ({
        deepening: { ...s.deepening, [point.id]: false },
        error: errorMessage(e),
      }))
    }
  },
  addManualThought: async (point, content) => {
    const trimmed = content.trim()
    if (!trimmed || get().deepening[point.id]) return
    set((s) => ({
      deepening: { ...s.deepening, [point.id]: true },
      error: null,
    }))
    try {
      const children = await saveManualPoint(point.id, trimmed)
      set((s) => ({
        points: [...s.points, ...children],
        expanded: { ...s.expanded, [point.id]: true },
        deepening: { ...s.deepening, [point.id]: false },
      }))
    } catch (e) {
      set((s) => ({
        deepening: { ...s.deepening, [point.id]: false },
        error: errorMessage(e),
      }))
      throw e
    }
  },
  addFactCheck: async (point, content) => {
    const trimmed = content.trim()
    if (!trimmed || get().deepening[point.id]) return
    set((s) => ({
      deepening: { ...s.deepening, [point.id]: true },
      error: null,
    }))
    try {
      const children = await saveFactCheckPoint(point.id, trimmed)
      set((s) => ({
        points: [...s.points, ...children],
        expanded: { ...s.expanded, [point.id]: true },
        deepening: { ...s.deepening, [point.id]: false },
      }))
    } catch (e) {
      set((s) => ({
        deepening: { ...s.deepening, [point.id]: false },
        error: errorMessage(e),
      }))
      throw e
    }
  },
  findSimilarFor: async (point) => {
    if (get().deepening[point.id]) return get().similar[point.id] ?? []
    set((s) => ({
      deepening: { ...s.deepening, [point.id]: true },
      error: null,
    }))
    try {
      const matches = await findSimilar(point.id, point.content)
      set((s) => ({
        similar: { ...s.similar, [point.id]: matches },
        deepening: { ...s.deepening, [point.id]: false },
      }))
      return matches
    } catch (e) {
      set((s) => ({
        deepening: { ...s.deepening, [point.id]: false },
        error: errorMessage(e),
      }))
      return []
    }
  },
  deletePoint: async (id) => {
    await deletePoint(id)
    const toRemove = collectSubtreeIds(get().points, [id])
    set((s) => ({ points: s.points.filter(p => !toRemove.has(p.id)) }))
    await useStarStore.getState().init()
  },
  archiveMany: async (ids) => {
    for (const id of ids) await archivePoint(id)
    const idSet = new Set(ids)
    set((s) => ({ points: s.points.filter(p => !idSet.has(p.id)) }))
  },
  deleteMany: async (rootIds) => {
    for (const id of rootIds) await deletePoint(id)
    const toRemove = collectSubtreeIds(get().points, rootIds)
    set((s) => ({ points: s.points.filter(p => !toRemove.has(p.id)) }))
    await useStarStore.getState().init()
  },
}))
