import type { AppSettings } from '../shared/contracts'

export function resolveWindowOpacity(settings: AppSettings, isPointerInside: boolean): number {
  return settings.hideWhenPointerLeaves && !isPointerInside ? 0 : settings.opacity
}
