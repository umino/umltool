import type { UmlApi } from './index'

declare global {
  interface Window {
    uml: UmlApi
  }
}

export {}
