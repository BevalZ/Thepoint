import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const srcRoot = path.join(repoRoot, 'src')
const allowedCoreImportFiles = new Set([
  normalize(path.join(srcRoot, 'api', 'invoke.ts')),
  normalize(path.join(srcRoot, 'pages', 'Gallery.tsx')),
])
const allowedEventImportFiles = new Set([
  normalize(path.join(srcRoot, 'store', 'exploreStore.ts')),
])

function normalize(filePath) {
  return filePath.replace(/^\/([A-Za-z]:)/, '$1').replace(/\\/g, '/')
}

function collectSourceFiles(dirPath) {
  const files = []
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const entryPath = path.join(dirPath, entry.name)
    if (entry.isDirectory()) {
      files.push(...collectSourceFiles(entryPath))
      continue
    }
    if (/\.(ts|tsx)$/.test(entry.name)) {
      files.push(normalize(entryPath))
    }
  }
  return files
}

function lineNumber(contents, index) {
  return contents.slice(0, index).split(/\r?\n/).length
}

const violations = []
for (const filePath of collectSourceFiles(srcRoot)) {
  const contents = fs.readFileSync(filePath, 'utf8')
  const relativeFile = path.relative(repoRoot, filePath).replace(/\\/g, '/')

  const coreImportMatches = contents.matchAll(/import\s+\{([^}]+)\}\s+from\s+['"]@tauri-apps\/api\/core['"]/g)
  for (const match of coreImportMatches) {
    if (!allowedCoreImportFiles.has(filePath)) {
      violations.push(`${relativeFile}:${lineNumber(contents, match.index ?? 0)} direct-core-import`)
      continue
    }
    if (relativeFile !== 'src/api/invoke.ts' && /\binvoke\b/.test(match[1] ?? '')) {
      violations.push(`${relativeFile}:${lineNumber(contents, match.index ?? 0)} direct-invoke-import`)
    }
  }

  const eventImportMatches = contents.matchAll(/import\s+\{([^}]+)\}\s+from\s+['"]@tauri-apps\/api\/event['"]/g)
  for (const match of eventImportMatches) {
    if (!allowedEventImportFiles.has(filePath)) {
      violations.push(`${relativeFile}:${lineNumber(contents, match.index ?? 0)} direct-event-import`)
    }
  }

  if (relativeFile !== 'src/api/invoke.ts') {
    const invokeMatches = contents.matchAll(/\binvoke\s*</g)
    for (const match of invokeMatches) {
      violations.push(`${relativeFile}:${lineNumber(contents, match.index ?? 0)} direct-invoke-call`)
    }
  }
}

if (violations.length > 0) {
  console.error(`[check-frontend-boundary] status: VIOLATION count=${violations.length}`)
  for (const violation of violations) console.error(`[check-frontend-boundary] ${violation}`)
  process.exitCode = 1
} else {
  console.log('[check-frontend-boundary] status: OK')
}
