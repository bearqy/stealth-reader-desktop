/// <reference types="vite/client" />

import type { StealthReaderApi } from '../../shared/contracts'

declare global {
  interface Window {
    stealthReader: StealthReaderApi
  }
}

export {}
