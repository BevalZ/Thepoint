import { describe, expect, it } from 'vitest'
import type { CommandPaletteItem } from '@/api/types'
import {
  capabilityTargetForCommand,
  commandPresentation,
  filterCommandPaletteItems,
} from './capabilityCenter'

function command(overrides: Partial<CommandPaletteItem> = {}): CommandPaletteItem {
  return {
    id: 'search.assets',
    title: 'Search: Unified Assets',
    category: 'search',
    description: 'Search all local assets.',
    keywords: ['library', 'find'],
    commandName: 'search_assets',
    wrapperName: 'searchAssets',
    executionKind: 'read',
    requiredInput: ['query'],
    inputHint: 'A search query.',
    risk: 'read_only',
    shortcutHint: null,
    sourceInspiration: 'Thepoint',
    priority: 100,
    ...overrides,
  }
}

describe('Capability Center helpers', () => {
  it('routes scorecard, diagnostics, and catalog commands to stable targets', () => {
    expect(capabilityTargetForCommand(command({
      id: 'system.capability_scorecard',
      commandName: 'build_capability_scorecard',
    }))).toEqual({ view: 'overview' })

    expect(capabilityTargetForCommand(command({
      id: 'diagnostics.citation_quality',
      commandName: 'load_citation_quality_dashboard',
    }))).toEqual({ view: 'diagnostics', diagnosticId: 'citation-quality' })

    expect(capabilityTargetForCommand(command())).toEqual({
      view: 'commands',
      commandId: 'search.assets',
    })
  })

  it('describes read-only, input-bound, and mutating commands without enabling execution', () => {
    expect(commandPresentation(command({
      executionKind: 'diagnostic',
      requiredInput: [],
    }))).toMatchObject({ label: '只读诊断', tone: 'safe', readOnly: true, requiresInput: false })

    expect(commandPresentation(command())).toMatchObject({
      label: '只读 · 需要输入',
      tone: 'attention',
      readOnly: true,
      requiresInput: true,
    })

    expect(commandPresentation(command({
      executionKind: 'model',
      requiredInput: [],
      risk: 'model_call',
    }))).toMatchObject({
      label: '调用模型',
      tone: 'restricted',
      readOnly: false,
    })
  })

  it('filters against command metadata while preserving manifest order', () => {
    const items = [
      command(),
      command({
        id: 'mirror.sync_audit',
        title: 'Export: Audit Mirror Sync',
        category: 'export',
        commandName: 'build_export_sync_audit',
        wrapperName: 'buildExportSyncAudit',
        keywords: ['mirror', 'consistency'],
      }),
    ]

    expect(filterCommandPaletteItems(items, 'mirror')).toEqual([items[1]])
    expect(filterCommandPaletteItems(items, 'BUILDEXPORT')).toEqual([items[1]])
    expect(filterCommandPaletteItems(items, '  ')).toEqual(items)
  })
})
