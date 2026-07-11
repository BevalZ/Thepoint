import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..', '..')
const rust = readFileSync(resolve(root, 'src-tauri/src/lib.rs'), 'utf8')
const map = readFileSync(resolve(root, 'frontend/src/api/commandMap.ts'), 'utf8')
const wrappers = readFileSync(resolve(root, 'frontend/src/api/index.ts'), 'utf8')

const rustNames = new Set([...rust.matchAll(/(?:commands::\w+|semantic::commands)::(\w+),/g)].map(match => match[1]))
const mapBody = map.slice(map.indexOf('export interface TauriCommandMap'), map.indexOf('export type TauriCommandName'))
const mapNames = new Set([...mapBody.matchAll(/^  (\w+): \{/gm)].map(match => match[1]))
const wrapperNames = new Set([...wrappers.matchAll(/invokeCommand\('([^']+)'/g)].map(match => match[1]))

function difference(left, right) { return [...left].filter(value => !right.has(value)).sort() }
const failures = [
  ['Rust only vs command map', difference(rustNames, mapNames)],
  ['Command map only vs Rust', difference(mapNames, rustNames)],
  ['Rust only vs wrappers', difference(rustNames, wrapperNames)],
  ['Wrappers only vs Rust', difference(wrapperNames, rustNames)],
].filter(([, values]) => values.length > 0)

if (failures.length > 0) {
  for (const [label, values] of failures) console.error(`${label}: ${values.join(', ')}`)
  process.exit(1)
}
console.log(`Command registry aligned: ${rustNames.size} commands`)
