import { SourceMapConsumer } from 'source-map-js'
import type { SourceLocation, ComponentInfo } from './types.js'

interface Fiber {
  tag: number;
  type: any;
  return: Fiber | null;
  _debugSource?: { fileName: string; lineNumber: number; columnNumber?: number } | null;
  _debugStack?: Error | null;
  // Who *created* this element (JSX owner), as opposed to `return` (parent in
  // the tree). For a host element rendered by a Server Component, this chain is
  // the only one that reaches server-side source — `_debugStack`/`return` stay
  // inside the client RSC runtime. An owner is either another Fiber (client
  // component) or a ReactComponentInfo (server component, from the flight payload).
  _debugOwner?: Fiber | ReactComponentInfo | null;
}

// React 19 flight debug node for a Server Component. Its `debugStack` (note: no
// leading underscore, unlike Fiber._debugStack) is an Error captured on the
// server at the JSX site; `owner` continues the owner chain upward.
interface ReactComponentInfo {
  owner?: Fiber | ReactComponentInfo | null;
  debugStack?: Error | null;
  name?: string;
}

function isFiber(x: Fiber | ReactComponentInfo | null | undefined): x is Fiber {
  return !!x && typeof (x as Fiber).tag === 'number';
}

interface Frame {
  fileName?: string;
  lineNumber?: number;
  columnNumber?: number;
}

// FunctionComponent = 0
// ClassComponent = 1
// ForwardRef = 11
// Memo = 14
// SimpleMemo = 15
const COMPOSITE_TAGS = new Set([0, 1, 11, 14, 15])

// DOM to Fiber

let fiberKey: string | null = null

export function getFiberFromElement(el: Element): Fiber | null {
  if (fiberKey && fiberKey in el) return (el as any)[fiberKey] ?? null
  for (const key of Object.keys(el)) {
    if (key.startsWith('__reactFiber$') || key.startsWith('__reactInternalInstance$')) {
      fiberKey = key
      return (el as any)[key] ?? null
    }
  }
  return null
}

function findComponentFiber(fiber: Fiber | null): Fiber | null {
  for (let f = fiber; f; f = f.return) if (COMPOSITE_TAGS.has(f.tag)) return f
  return null
}

function getDisplayName(type: any): string | null {
  if (typeof type === 'string') return type
  if (!type) return null
  const t = typeof type === 'function' ? type : (type.type ?? type.render)

  return t?.displayName || t?.name || type.displayName || type.name || null
}

export function getComponentInfo(el: Element): ComponentInfo | null {
  const fiber = findComponentFiber(getFiberFromElement(el))
  const name = fiber && getDisplayName(fiber.type)
  return name ? { name, file: null } : null
}

export function resolveSourceSync(el: Element): SourceLocation | null {
  for (let f = getFiberFromElement(el); f; f = f.return) {
    const s = f._debugSource
    if (s && typeof s.fileName === 'string' && typeof s.lineNumber === 'number') {
      return { file: s.fileName, line: s.lineNumber, column: s.columnNumber ?? 0 }
    }
  }
  return null
}

function parseStack(stack: string): Frame[] {
  const out: Frame[] = []
  for (const raw of stack.split('\n')) {
    const m = /^\s*at (?:.+? \()?(.+?):(\d+):(\d+)\)?$/.exec(raw) || /^(?:.*?)@(.+?):(\d+):(\d+)$/.exec(raw)
    if (m) out.push({ fileName: m[1], lineNumber: +m[2], columnNumber: +m[3] })
  }
  return out
}

const mapCache = new Map<string, SourceMapConsumer | null>()

async function symbolicate(frame: Frame): Promise<Frame | null> {
  if (!frame.fileName || frame.lineNumber == null) return null
  try {
    let consumer = mapCache.get(frame.fileName)
    if (consumer === undefined) {
      const code = await (await fetch(frame.fileName)).text()
      const m = /\/\/# sourceMappingURL=(.+)$/m.exec(code)
      const rawMap = m ? m[1].startsWith('data:') ? JSON.parse(atob(m[1].split(',')[1])) : await (await fetch(new URL(m[1], frame.fileName).href)).json()
        : null
      consumer = rawMap ? new SourceMapConsumer(rawMap) : null
      mapCache.set(frame.fileName, consumer)
    }
    if (!consumer) return frame
    const p = consumer.originalPositionFor({
      line: frame.lineNumber,
      column: frame.columnNumber ?? 0
    })
    return p.source ? { fileName: p.source, lineNumber: p.line ?? undefined, columnNumber: p.column ?? undefined }
      : frame
  } catch { return frame }
}

// React 19 wraps server owner-stack frame URLs as `rsc://React/Server/<url>?<n>`
// and appends a `?<cacheBust>` query to client ones. Next's endpoint wants the
// bare URL/path, so strip both before sending.
function cleanFrameFile(file: string): string {
  return file.replace(/^rsc:\/\/React\/[^/]*\//, '').replace(/\?\d+$/, '')
}

// Next.js dev exposes a symbolication endpoint that maps compiled frames back to
// project-relative source using the maps only the server has, and flags
// framework-internal frames as `ignored`. Both are things the client can't do
// well: parsing stack compiled URLs client-side picks React internals and yields
// bundled paths (see MINI_BIPPY caveat #1). The first non-ignored frame is the
// user's code. `isServer` selects server vs client source maps — RSC owner
// frames are server frames. Returns null on non-Next hosts (endpoint 404s).
async function resolveViaNext(frames: Frame[], isServer: boolean): Promise<SourceLocation | null> {
  let data: unknown
  try {
    const res = await fetch('/__nextjs_original-stack-frames', {
      method: 'POST',
      body: JSON.stringify({
        frames: frames.map(f => ({
          file: cleanFrameFile(f.fileName!), methodName: '<unknown>',
          line1: f.lineNumber, column1: f.columnNumber, arguments: [],
        })),
        isServer, isEdgeServer: false, isAppDirectory: true,
      }),
    })
    if (!res.ok) return null
    data = await res.json()
  } catch { return null }
  if (!Array.isArray(data)) return null
  for (const entry of data) {
    const o = entry?.status === 'fulfilled' ? entry.value?.originalStackFrame : entry?.originalStackFrame
    if (o && !o.ignored && o.file) {
      return { file: o.file, line: o.line1 ?? 0, column: o.column1 ?? 0 }
    }
  }
  return null
}

// Walk the OWNER chain (who created this element), collecting each owner's
// captured stack. Client owners (Fibers) carry `_debugStack`; server owners
// (ReactComponentInfo, from the flight payload) carry `debugStack` — the latter
// is the only way to reach Server Component source from the browser.
// ponytail: naive regex parse of the .stack string + Next's endpoint doing the
// source-map/ignore-list work, instead of react-grab's full CallSite+VLQ engine.
// Upgrade to the CallSite path only if the regex proves flaky on some frame.
function collectOwnerFrames(fiber: Fiber): { frames: Frame[]; isServer: boolean }[] {
  const groups: { frames: Frame[]; isServer: boolean }[] = []
  let node: Fiber | ReactComponentInfo | null | undefined = fiber
  const seen = new Set<object>()
  while (node && !seen.has(node)) {
    seen.add(node)
    if (isFiber(node)) {
      const err = node._debugStack
      if (err instanceof Error && typeof err.stack === 'string') {
        groups.push({ frames: parseStack(err.stack).filter(f => f.fileName), isServer: false })
      }
      node = node._debugOwner
    } else {
      const err = node.debugStack
      if (err instanceof Error && typeof err.stack === 'string') {
        groups.push({ frames: parseStack(err.stack).filter(f => f.fileName), isServer: true })
      }
      node = node.owner
    }
  }
  return groups
}

export async function resolveSourceAsync(el: Element): Promise<SourceLocation | null> {
  const fiber = getFiberFromElement(el)
  if (!fiber) return null
  // Try each owner's stack in order (nearest first), letting Next's endpoint
  // pick the first non-ignored (user) frame within each. Server groups resolve
  // Server Component source; client groups resolve Client Component source.
  for (const group of collectOwnerFrames(fiber)) {
    if (!group.frames.length) continue
    const loc = await resolveViaNext(group.frames, group.isServer)
    if (loc) return loc
  }
  // Non-Next fallback: client-side source map of the first js frame off _debugStack.
  const stack = fiber._debugStack
  if (!(stack instanceof Error)) return null
  const frame = parseStack(String(stack.stack)).find(f => f.fileName && /\.(jsx|tsx|ts|js)$/.test(f.fileName))
  if (!frame) return null
  const orig = await symbolicate(frame)
  return orig ? { file: orig.fileName!, line: orig.lineNumber ?? 0, column: orig.columnNumber ?? 0 } : null
}

const cache = new WeakMap<Element, SourceLocation | null>()

export function resolveSourceCached(el: Element): SourceLocation | null {
  return cache.get(el) ?? null
}

export async function warmSource(el: Element): Promise<void> {
  if (cache.has(el)) return
  const sync = resolveSourceSync(el)
  if (sync) { cache.set(el, sync); return }
  cache.set(el, await resolveSourceAsync(el))
}