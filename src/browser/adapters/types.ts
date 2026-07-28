import type { SourceLocation, ComponentInfo } from '../types.js'

// The only runtime operations that differ between frameworks: recovering an
// element's source location and owning component. Everything else in the
// browser tier (overlay, comments, hover-panel, inspector geometry) is
// framework-agnostic. A framework is identified by a cheap O(1) discriminant
// (`matches`) so a single overlay bundle serves Vue and React without any
// build-time selection — see resolver.ts.
export interface FrameworkAdapter {
  /** Does this element belong to this framework? Must be cheap (own-prop check). */
  matches(el: Element): boolean
  getSource(el: Element): SourceLocation | null
  getComponent(el: Element): ComponentInfo | null
  /** Optional async pre-resolve, called on hover (React 19 needs Next symbolication). */
  warm?(el: Element): Promise<void>
}
