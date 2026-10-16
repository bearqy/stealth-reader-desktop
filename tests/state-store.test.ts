import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { StateStore } from '../src/main/state-store'

const temporaryDirectories: string[] = []

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'stealth-reader-test-'))
  temporaryDirectories.push(directory)
  return directory
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { force: true, recursive: true })
    )
  )
})

describe('StateStore', () => {
  it('uses local-first defaults when no state exists', async () => {
    const directory = await temporaryDirectory()
    const store = new StateStore(join(directory, 'state.json'))
    await store.load()

    expect(store.getLibrary()).toEqual([])
    expect(store.getSettings()).toMatchObject({
      alwaysOnTop: false,
      opacity: 1,
      hideWhenPointerLeaves: false,
      sidebarHidden: false,
      hideWebMedia: false,
      textOnlyWeb: false,
      transparentAppChrome: false,
      toolbarCollapsed: false,
      bossShortcut: 'CommandOrControl+Shift+H'
    })
  })

  it('migrates the earlier focus-based visibility setting', async () => {
    const directory = await temporaryDirectory()
    const filePath = join(directory, 'state.json')
    await writeFile(
      filePath,
      JSON.stringify({
        version: 1,
        settings: { hideWhenUnfocused: true },
        library: []
      }),
      'utf8'
    )
    const store = new StateStore(filePath)

    await store.load()

    expect(store.getSettings().hideWhenPointerLeaves).toBe(true)
  })

  it('defaults startup update checks on for older settings and persists opt-out', async () => {
    const directory = await temporaryDirectory()
    const filePath = join(directory, 'state.json')
    const store = new StateStore(filePath)
    await store.load()
    expect(store.getSettings().checkUpdatesOnLaunch).toBe(true)
    await store.updateSettings({ checkUpdatesOnLaunch: false })
    const reloaded = new StateStore(filePath)
    await reloaded.load()
    expect(reloaded.getSettings().checkUpdatesOnLaunch).toBe(false)
  })

  it('migrates the earlier automatic toolbar setting to the manual switch', async () => {
    const directory = await temporaryDirectory()
    const filePath = join(directory, 'state.json')
    await writeFile(
      filePath,
      JSON.stringify({
        version: 1,
        settings: { collapseChromeOnBlur: true },
        library: []
      }),
      'utf8'
    )
    const store = new StateStore(filePath)

    await store.load()

    expect(store.getSettings().toolbarCollapsed).toBe(true)
  })

  it('persists the manual toolbar collapse preference', async () => {
    const directory = await temporaryDirectory()
    const filePath = join(directory, 'state.json')
    const store = new StateStore(filePath)
    await store.load()

    expect((await store.updateSettings({ toolbarCollapsed: true })).toolbarCollapsed).toBe(
      true
    )
    const persisted = JSON.parse(await readFile(filePath, 'utf8')) as {
      settings: { toolbarCollapsed: boolean }
    }
    expect(persisted.settings.toolbarCollapsed).toBe(true)
  })

  it('clamps unsafe opacity values before persisting', async () => {
    const directory = await temporaryDirectory()
    const filePath = join(directory, 'state.json')
    const store = new StateStore(filePath)
    await store.load()

    expect((await store.updateSettings({ opacity: 0.01 })).opacity).toBe(0.35)
    const persisted = JSON.parse(await readFile(filePath, 'utf8')) as {
      settings: { opacity: number }
    }
    expect(persisted.settings.opacity).toBe(0.35)
  })

  it('persists the collapsed sidebar preference', async () => {
    const directory = await temporaryDirectory()
    const filePath = join(directory, 'state.json')
    const store = new StateStore(filePath)
    await store.load()

    expect((await store.updateSettings({ sidebarHidden: true })).sidebarHidden).toBe(true)
    const persisted = JSON.parse(await readFile(filePath, 'utf8')) as {
      settings: { sidebarHidden: boolean }
    }
    expect(persisted.settings.sidebarHidden).toBe(true)
  })

  it('persists the hidden web media preference', async () => {
    const directory = await temporaryDirectory()
    const filePath = join(directory, 'state.json')
    const store = new StateStore(filePath)
    await store.load()

    expect((await store.updateSettings({ hideWebMedia: true })).hideWebMedia).toBe(true)
    const persisted = JSON.parse(await readFile(filePath, 'utf8')) as {
      settings: { hideWebMedia: boolean }
    }
    expect(persisted.settings.hideWebMedia).toBe(true)
  })

  it('persists the web text-only preference', async () => {
    const directory = await temporaryDirectory()
    const filePath = join(directory, 'state.json')
    const store = new StateStore(filePath)
    await store.load()

    expect((await store.updateSettings({ textOnlyWeb: true })).textOnlyWeb).toBe(true)
    const persisted = JSON.parse(await readFile(filePath, 'utf8')) as {
      settings: { textOnlyWeb: boolean }
    }
    expect(persisted.settings.textOnlyWeb).toBe(true)
  })

  it('persists the transparent app chrome preference', async () => {
    const directory = await temporaryDirectory()
    const filePath = join(directory, 'state.json')
    const store = new StateStore(filePath)
    await store.load()

    expect(
      (await store.updateSettings({ transparentAppChrome: true })).transparentAppChrome
    ).toBe(true)
    const persisted = JSON.parse(await readFile(filePath, 'utf8')) as {
      settings: { transparentAppChrome: boolean }
    }
    expect(persisted.settings.transparentAppChrome).toBe(true)
  })

  it('stores library metadata without exposing the source path', async () => {
    const directory = await temporaryDirectory()
    const statePath = join(directory, 'state.json')
    const bookPath = join(directory, 'quiet.txt')
    await writeFile(bookPath, 'hello', 'utf8')
    const store = new StateStore(statePath)
    await store.load()

    const item = await store.addTextFile(bookPath)

    expect(item.title).toBe('quiet')
    expect(item).not.toHaveProperty('filePath')
    expect(store.getStoredItem(item.id).filePath).toBe(bookPath)
  })

  it('rejects non-finite reading progress', async () => {
    const directory = await temporaryDirectory()
    const bookPath = join(directory, 'quiet.txt')
    await writeFile(bookPath, 'hello', 'utf8')
    const store = new StateStore(join(directory, 'state.json'))
    await store.load()
    const item = await store.addTextFile(bookPath)

    await expect(store.updateProgress(item.id, Number.NaN)).rejects.toThrow('阅读进度无效')
    expect(store.getLibrary()[0]?.progress).toBe(0)
  })

  it('persists chapter-relative bookmarks and upgrades legacy state without losing progress', async () => {
    const directory = await temporaryDirectory()
    const file = join(directory, 'state.json')
    const store = new StateStore(file)
    await store.load()
    const item = await store.addTextFile(join(directory, 'novel.txt'))
    await store.updateProgress(item.id, 0.6, { chapterStart: 1234, chapterProgress: 0.4 })
    const restored = new StateStore(file)
    await restored.load()
    expect(restored.getLibrary()[0]).toMatchObject({ progress: 0.6, readerPosition: { chapterStart: 1234, chapterProgress: 0.4 } })
    const raw = JSON.parse(await readFile(file, 'utf8'))
    expect(raw.version).toBe(2)
    raw.version = 1
    delete raw.library[0].readerPosition
    await writeFile(file, JSON.stringify(raw))
    const legacy = new StateStore(file)
    await legacy.load()
    expect(legacy.getLibrary()[0]).toMatchObject({ progress: 0.6 })
  })

  it('rejects invalid chapter bookmarks without changing the prior progress', async () => {
    const directory = await temporaryDirectory()
    const store = new StateStore(join(directory, 'state.json'))
    await store.load()
    const item = await store.addTextFile(join(directory, 'novel.txt'))
    await expect(store.updateProgress(item.id, 0.8, { chapterStart: -1, chapterProgress: 0.2 })).rejects.toThrow('章节阅读位置无效')
    expect(store.getLibrary()[0].progress).toBe(0)
  })
})
