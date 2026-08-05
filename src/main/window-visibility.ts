import type { AppSettings } from '../shared/contracts'

export function resolveWindowOpacity(settings: AppSettings, isFocused: boolean): number {
  return settings.hideWhenUnfocused && !isFocused ? 0 : settings.opacity
}
