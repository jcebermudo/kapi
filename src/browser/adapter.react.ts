// use this for later: import type { SourceLocation, ComponentInfo } from './types.js'
interface SourceInfo {
  filePath: string;
  lineNumber: number | null;
  columnNumber: number | null;
  componentName: string | null;
}