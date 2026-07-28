import type { SourceLocation, ComponentInfo, VueComponentInstance } from './types.js'
import { findTraceFromElement } from './trace-record.js'
import { getFiberFromElement, resolveSourceCached, warmSource as warmReactSource, getComponentInfo as getReactComponentInfo } from './fiber.js'

// Vue implementation of the FrameworkAdapter seam (see adapter.ts). These are
// the only two element-introspection functions that touch framework internals;
// everything else in inspector.ts is plain DOM and stays shared.

export function getSourceLocation(el: Element): SourceLocation | null {
  // React — reads the cache warmSource() primed on hover. React 19's source is
  // resolved asynchronously (source-map symbolication), so a sync read straight
  // off the fiber would miss it; the cache bridges that async gap.
  if (getFiberFromElement(el)) {
    return resolveSourceCached(el)
  }
  // Vue
  let node: Element | null = el
  while (node) {
    const trace = findTraceFromElement(node)
    if (trace) return trace
    node = node.parentElement
  }
  return null
}

// Primes the source cache read by getSourceLocation(). React source resolution
// is async (source-map symbolication on React 19); inspector.ts calls this on
// hover so the result is ready by click time. No-op for Vue (source is sync).
export function warmSource(el: Element): Promise<void> {
  return getFiberFromElement(el) ? warmReactSource(el) : Promise.resolve()
}

let warnedMissingComponentInfo = false

export function getComponentInfo(el: Element): ComponentInfo | null {
  if (getFiberFromElement(el)) return getReactComponentInfo(el)

  const instance = (el as Element & { __vueParentComponent?: VueComponentInstance }).__vueParentComponent

  if (!instance) {
    // `el.__vnode` (see trace-record.ts) is a separate internal Vue
    // back-reference from `__vueParentComponent`. If it's present but
    // `__vueParentComponent` isn't, that's not "this element isn't
    // Vue-managed" (the normal, silent null case) — it's a sign Vue
    // renamed/removed this internal property, so warn once rather than
    // degrading silently everywhere.
    if (!warnedMissingComponentInfo && findTraceFromElement(el)) {
      warnedMissingComponentInfo = true
      console.warn(
        '[kapi] Could not resolve Vue component info for an element with a known source location. ' +
          "Vue's internal `__vueParentComponent` property may have changed in this Vue version — " +
          'component names/files will be unavailable until kapi is updated to match.',
      )
    }
    return null
  }

  const name = instance.type.name || instance.type.__name
  if (!name) return null

  return { name, file: instance.type.__file ?? null }
}
