import type { SourceLocation, ComponentInfo } from './types.js'
import type { FrameworkAdapter } from './adapters/types.js'
import { reactAdapter } from './adapters/react.js'
import { vueAdapter } from './adapters/vue.js'

// The single place the Vue-vs-React branch lives. inspector.ts and comments.ts
// call these framework-blind; add a framework by dropping an adapter here.
const ADAPTERS: FrameworkAdapter[] = [reactAdapter, vueAdapter]

// An app is one framework, so lock onto the first adapter that matches and skip
// the scan thereafter. Re-scan only if the locked one stops matching (defensive
// — e.g. an iframe/micro-frontend of a different framework).
let active: FrameworkAdapter | null = null

function adapterFor(el: Element): FrameworkAdapter | null {
  if (active?.matches(el)) return active
  return (active = ADAPTERS.find((a) => a.matches(el)) ?? active)
}

export function getSourceLocation(el: Element): SourceLocation | null {
  return adapterFor(el)?.getSource(el) ?? null
}

export function getComponentInfo(el: Element): ComponentInfo | null {
  return adapterFor(el)?.getComponent(el) ?? null
}

// Resolves once the element's source is cached (immediately for sync
// frameworks). Callers await it to re-render UI that read a not-yet-warmed
// null on first paint.
export function warmSource(el: Element): Promise<void> {
  return Promise.resolve(adapterFor(el)?.warm?.(el))
}
