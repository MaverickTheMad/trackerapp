import type { TrackerApi } from './index'

declare global {
  interface Window {
    api: TrackerApi
  }
}

export {}
