export interface TitleBarOverlayAppearance {
  color: string
  symbolColor: string
  height: number
}

export interface WindowChromeOptions {
  transparent: boolean
  backgroundColor: string
  titleBarStyle: 'default' | 'hidden' | 'hiddenInset'
  titleBarOverlay: false | TitleBarOverlayAppearance
  autoHideMenuBar: boolean
}

export function windowsTitleBarOverlay(
  transparentAppChrome: boolean
): TitleBarOverlayAppearance {
  return {
    color: transparentAppChrome ? '#00000000' : '#f7f9f6',
    symbolColor: '#26372e',
    height: 30
  }
}

export function windowChromeOptions(
  platform: NodeJS.Platform,
  transparentAppChrome: boolean
): WindowChromeOptions {
  const supportsTransparentWindow = platform === 'darwin' || platform === 'win32'
  return {
    transparent: supportsTransparentWindow,
    backgroundColor: supportsTransparentWindow ? '#00000000' : '#edf1ec',
    titleBarStyle:
      platform === 'darwin' ? 'hiddenInset' : platform === 'win32' ? 'hidden' : 'default',
    titleBarOverlay:
      platform === 'win32' ? windowsTitleBarOverlay(transparentAppChrome) : false,
    autoHideMenuBar: platform === 'win32'
  }
}

export function shouldHideWindowOnClose(
  platform: NodeJS.Platform,
  quitting: boolean
): boolean {
  return platform === 'darwin' && !quitting
}
