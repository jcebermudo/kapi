import type { SourceLocation, ComponentInfo, VueComponentInstance } from '../types.js'
import { findTraceFromElement } from '../trace-record.js'
import type { FrameworkAdapter } from './types.js'

// Most elements resolve directly via `el.__vnode` (see trace-record.ts). The
// ancestor walk exists for the elements that can't: plain text nodes (no vnode
// at all), `_createStaticVNode` content (raw innerHTML — Vue never creates
// individual vnodes for its inner elements), and vnodes Vue cloned *with* extra
// props (`cloneVNode(vnode, extraProps)` builds a fresh `props` object via
// `mergeProps`, breaking the WeakMap identity link — a clone with no extraProps
// reuses the same `props` reference and resolves directly). In all of these,
// the nearest traced ancestor is the best available approximation.
function getSource(el: Element): SourceLocation | null {
  let node: Element | null = el
  while (node) {
    const trace = findTraceFromElement(node)
    if (trace) return trace
    node = node.parentElement
  }
  return null
}

let warnedMissingComponentInfo = false

function getComponent(el: Element): ComponentInfo | null {
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

export const vueAdapter: FrameworkAdapter = {
  // `__vnode` is Vue's own DOM→vnode back-reference (used by getSource via
  // trace-record); its presence is the cheap "this is a Vue element" signal.
  matches: (el) => '__vnode' in el || '__vueParentComponent' in el,
  getSource,
  getComponent,
}
