import { getFiberFromElement, getReactComponentInfo, resolveReactSourceCached, warmReactSource } from '../react-fiber.js'
import type { FrameworkAdapter } from './types.js'

export const reactAdapter: FrameworkAdapter = {
  // React stamps every host node with a `__reactFiber$…` own property — a
  // reliable, O(1) discriminant (getFiberFromElement caches the key).
  matches: (el) => getFiberFromElement(el) !== null,
  getSource: (el) => resolveReactSourceCached(el),
  getComponent: (el) => getReactComponentInfo(el),
  warm: (el) => warmReactSource(el),
}
