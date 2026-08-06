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
})
