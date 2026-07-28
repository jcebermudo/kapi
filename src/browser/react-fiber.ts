// React variant of trace-record/inspector's Vue internals: clicked/hovered DOM
// element → { file, line, column } + component name, with zero build-time
// transform. Vendored slice of bippy (see MINI_BIPPY_FOR_KAPI.md) plus a
// Next.js-specific source path.
//
// React 19 removed `_debugSource`, so file:line can't be read off the fiber
// directly. What it keeps is `_debugStack` — an Error captured at the JSX site
// whose frames point at COMPILED locations (and, for Server Components, a
// virtual `about://React/Server/…` server chunk that the browser can't even
// fetch, let alone source-map). Rather than ship a source-map resolver, hand
// those frames to Next's own dev overlay endpoint, which already symbolicates
// them server-side and returns a project-relative file + 1-based line/col.
import type { SourceLocation, ComponentInfo } from './types.js'

interface Fiber {
  tag: number
  type: unknown
  return: Fiber | null
  _debugSource?: { fileName: string; lineNumber: number; columnNumber?: number } | null
  _debugStack?: Error | null
  // The component that created this element in JSX. A Fiber for client
  // components; a lightweight ReactComponentInfo ({ name, owner, env }) for
  // Server Components (which have no client fiber of their own).
  _debugOwner?: Fiber | { name?: string; owner?: unknown } | null
}

// Next.js App Router client-tree wrappers that sit between a user element and
// its (Server) component in the fiber `return` chain. Skip them when naming a
// component so hovering yields "Home"/"Image", not "SegmentViewNode".
const INTERNAL_NAMES = new Set([
  'SegmentViewNode', 'OuterLayoutRouter', 'InnerLayoutRouter', 'RenderFromTemplateContext',
  'RedirectBoundary', 'RedirectErrorBoundary', 'NotFoundBoundary', 'HTTPAccessFallbackBoundary',
  'LoadingBoundary', 'ErrorBoundary', 'ClientPageRoot', 'ClientSegmentRoot',
  'ScrollAndFocusHandler', 'AppRouter', 'Root',
])

// FunctionComponent=0, ClassComponent=1, ForwardRef=11, Memo=14, SimpleMemo=15
const COMPOSITE_TAGS = new Set([0, 1, 11, 14, 15])

// React stamps every host node with a `__reactFiber$<random>` own property
// (legacy `__reactInternalInstance$` for React <17). The suffix is stable per
// page load, so cache the first key we find.
let fiberKey: string | null = null

export function getFiberFromElement(el: Element): Fiber | null {
  const bag = el as unknown as Record<string, Fiber | undefined>
  if (fiberKey && fiberKey in el) return bag[fiberKey] ?? null
  for (const key of Object.keys(el)) {
    if (key.startsWith('__reactFiber$') || key.startsWith('__reactInternalInstance$')) {
      fiberKey = key
      return bag[key] ?? null
    }
  }
  return null
}

function findComponentFiber(fiber: Fiber | null): Fiber | null {
  for (let f = fiber; f; f = f.return) if (COMPOSITE_TAGS.has(f.tag)) return f
  return null
}

function getDisplayName(type: unknown): string | null {
  if (typeof type === 'string') return type
  if (!type) return null
  const o = type as Record<string, unknown> & { type?: unknown; render?: unknown }
  const t = (typeof type === 'function' ? type : (o.type ?? o.render)) as { displayName?: string; name?: string } | undefined
  return t?.displayName || t?.name || o.displayName as string || o.name as string || null
}

// Name of a JSX owner: a plain `.name` for a Server Component's
// ReactComponentInfo, else the display name off a client-component fiber.
function ownerName(o: NonNullable<Fiber['_debugOwner']>): string | null {
  if (typeof (o as { name?: string }).name === 'string') return (o as { name: string }).name
  return getDisplayName((o as Fiber).type)
}

function nextOwner(o: NonNullable<Fiber['_debugOwner']>): Fiber['_debugOwner'] {
  return (o as Fiber)._debugOwner ?? (o as { owner?: Fiber['_debugOwner'] }).owner ?? null
}

// Wrapper components whose exported component has no resolvable name on its
// own fiber — e.g. next/image's `Image` is `forwardRef((props, ref) => ...)`
// with no `.displayName` and an anonymous render fn, so `getDisplayName`
// returns null for that owner link and the walk below skips straight past it
// to the next named ancestor (typically the page). The DOM output is still
// identifiable, so check for each library's own marker attribute instead of
// trying to name an anonymous function. Extend only when another such gap
// surfaces — this is not a general component-library integration.
const KNOWN_WRAPPERS: { attr: string; name: string }[] = [
  { attr: 'data-nimg', name: 'Image' }, // next/image
]

function knownWrapperName(el: Element): string | null {
  for (const { attr, name } of KNOWN_WRAPPERS) {
    if (el.hasAttribute(attr)) return name
  }
  return null
}

// Library internals whose exported component name doesn't match the public
// import name — e.g. next/link's default export is `function LinkComponent`
// (not `Link`; no forwardRef, no wrapper attribute to key off like Image, so
// this is a rename rather than a KNOWN_WRAPPERS lookup). Same "gap between
// what the fiber says and what the user typed" as KNOWN_WRAPPERS above;
// extend only when another such mismatch surfaces.
const KNOWN_RENAMES: Record<string, string> = {
  LinkComponent: 'Link', // next/link
}

function renamed(name: string): string {
  return KNOWN_RENAMES[name] ?? name
}

export function getReactComponentInfo(el: Element): ComponentInfo | null {
  const known = knownWrapperName(el)
  if (known) return { name: known, file: null }

  const fiber = getFiberFromElement(el)

  // Prefer the JSX owner chain (the component that authored the element) over
  // the fiber `return` chain: for Server-Component content the tree parent is
  // a Next internal, but the owner is the user's component. Skip internals.
  for (let o = fiber?._debugOwner, i = 0; o && i < FIBER_WALK_LIMIT; o = nextOwner(o), i++) {
    const name = ownerName(o)
    if (name && !INTERNAL_NAMES.has(name)) return { name: renamed(name), file: null }
  }

  // Fallback (client-only trees, or owner info absent): nearest composite
  // fiber up the tree that isn't a framework wrapper.
  for (let f = findComponentFiber(fiber), i = 0; f && i < FIBER_WALK_LIMIT; f = findComponentFiber(f.return), i++) {
    const name = getDisplayName(f.type)
    if (name && !INTERNAL_NAMES.has(name)) return { name: renamed(name), file: null }
  }
  return null
}

// ── Source resolution ───────────────────────────────────────────────────────
// The async Next path is populated on hover (warmReactSource) so the click can
// read it synchronously, keeping getSourceLocation's sync interface unchanged.
const cache = new WeakMap<Element, SourceLocation | null>()

// React <=18: original file/line is baked into `_debugSource`, read straight
// off the fiber chain — no fetch, no symbolication.
function resolveDebugSource(el: Element): SourceLocation | null {
  for (let f = getFiberFromElement(el); f; f = f.return) {
    const s = f._debugSource
    if (s && typeof s.fileName === 'string' && typeof s.lineNumber === 'number') {
      return { file: s.fileName, line: s.lineNumber, column: s.columnNumber ?? 0 }
    }
  }
  return null
}

export function resolveReactSourceCached(el: Element): SourceLocation | null {
  if (cache.has(el)) return cache.get(el) ?? null
  const sync = resolveDebugSource(el) // React <=18 fast path, always available
  if (sync) cache.set(el, sync)
  return sync
}

// React 19 via Next's dev overlay endpoint (see middleware-turbopack.js).
// Frames use 1-based line1/column1; the raw `about://React/Server/…` file
// string is sent as-is (the server devirtualizes it). Internal React/Next
// frames come back `ignored: true`, so we send every frame and take the first
// non-ignored result rather than guessing which frame is the JSX callsite.
interface NextFrame { file: string; methodName: string; line1: number; column1: number; arguments: [] }
interface NextResult {
  status: string
  value?: { originalStackFrame: { file: string; line1: number; column1: number; ignored?: boolean } | null }
}

function parseFrames(stack: string): NextFrame[] {
  const out: NextFrame[] = []
  for (const raw of stack.split('\n')) {
    // "at fn (url:line:col)" and "at url:line:col" (V8). The message line
    // ("Error: react-stack-top-frame") has no "at " prefix and is skipped.
    const m = /^\s*at (?:(.+?) \()?(.+?):(\d+):(\d+)\)?$/.exec(raw)
    if (m) out.push({ methodName: m[1] ?? '<unknown>', file: m[2]!, line1: +m[3]!, column1: +m[4]!, arguments: [] })
  }
  return out
}

const FIBER_WALK_LIMIT = 8

// Gather candidate frames by walking up the fiber `return` chain, not just the
// hovered element's own fiber. A host element rendered *inside* a library
// component (e.g. next/image's <img>) has a `_debugStack` pointing at that
// library's code (next/dist → ignored server-side), never at the user file.
// The user's real location lives on an ANCESTOR fiber: the <Image> element was
// created in Home, so the Image fiber's `_debugStack` points at page.tsx.
// Concatenate every fiber's frames (leaf first, deduped) so the first
// non-ignored result is the nearest user-land callsite.
function collectFrames(el: Element): { frames: NextFrame[]; isServer: boolean } {
  const frames: NextFrame[] = []
  const seen = new Set<string>()
  let isServer = false
  let depth = 0
  for (let f = getFiberFromElement(el); f && depth < FIBER_WALK_LIMIT; f = f.return, depth++) {
    const stack = f._debugStack?.stack
    if (!stack) continue
    const s = String(stack)
    if (s.includes('about://React/Server/')) isServer = true
    for (const fr of parseFrames(s)) {
      const key = `${fr.file}:${fr.line1}:${fr.column1}`
      if (seen.has(key)) continue
      seen.add(key)
      frames.push(fr)
    }
  }
  return { frames, isServer }
}

async function resolveViaNext(el: Element): Promise<SourceLocation | null> {
  const { frames, isServer } = collectFrames(el)
  if (!frames.length) return null
  let res: Response
  try {
    res = await fetch('/__nextjs_original-stack-frames', {
      method: 'POST',
      body: JSON.stringify({ frames, isServer, isEdgeServer: false, isAppDirectory: true }),
    })
  } catch {
    return null // not a Next dev server (endpoint absent) — nothing to resolve
  }
  if (!res.ok) return null
  const data = (await res.json()) as NextResult[]
  const hit = data.find(d => d.status === 'fulfilled' && d.value?.originalStackFrame && !d.value.originalStackFrame.ignored)
  const f = hit?.value?.originalStackFrame
  return f ? { file: f.file, line: f.line1, column: f.column1 } : null
}

// Call on hover so the async Next resolve finishes before the click reads it.
export async function warmReactSource(el: Element): Promise<void> {
  if (cache.has(el)) return
  const sync = resolveDebugSource(el)
  if (sync) { cache.set(el, sync); return }
  cache.set(el, await resolveViaNext(el))
}
