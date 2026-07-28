import type { SourceLocation, ComponentInfo } from './types.js'

export interface FrameworkAdapter {
  getSourceLocation(el: Element): SourceLocation | null
  getComponentInfo(el: Element): ComponentInfo | null
}

// Build-time seam: shared UI imports these from './adapter.js'; this one line
// selects the framework variant. Swap to './adapter.react.js' (or a bundler
// alias) when React support lands.
export { getSourceLocation, getComponentInfo, warmSource } from './adapter.vue.js'