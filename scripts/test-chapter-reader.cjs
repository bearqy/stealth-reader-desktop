// Exercise the actual React reader and native Chromium scrolling, not a mocked DOM.
const assert = require('node:assert/strict')
const { readFileSync, mkdtempSync, writeFileSync, mkdirSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { resolve, join } = require('node:path')
const { setTimeout: delay } = require('node:timers/promises')
const { app, BrowserWindow } = require('electron')
const { buildSync } = require('esbuild')

app.setPath('userData', mkdtempSync(join(tmpdir(), 'stealth-chapter-scroll-test-')))
const timeout = setTimeout(() => { console.error('Reader interaction tests timed out'); app.exit(1) }, 45_000)

app.whenReady().then(async () => {
  const window = new BrowserWindow({ width: 1000, height: 760, show: false,
    webPreferences: { backgroundThrottling: false, contextIsolation: true, nodeIntegration: false } })
  const evaluate = (code) => window.webContents.executeJavaScript(code)
  const screenshot = async (name) => {
    if (!process.env.READER_TEST_ARTIFACTS) return
    const directory = resolve(process.env.READER_TEST_ARTIFACTS)
    mkdirSync(directory, { recursive: true })
    await delay(100)
    writeFileSync(join(directory, name), (await window.webContents.capturePage()).toPNG())
  }
  const until = async (expression) => {
    const deadline = Date.now() + 4000
    while (Date.now() < deadline) {
      if (await evaluate(expression)) return
      await delay(30)
    }
    throw new Error(`Reader condition failed: ${expression}\n${JSON.stringify(await read())}\n${JSON.stringify(await evaluate('readerHarness.events.at(-1)'))}\nKeys: ${JSON.stringify(await evaluate('globalThis.readerKeys'))}`)
  }
  const read = () => evaluate(`(() => {
    const viewport = document.querySelector('.reader-chapter-scroll');
    if (!viewport) return { settings: true, font: document.querySelector('#readerFontFamily')?.value,
      spacing: document.querySelector('#readerLetterSpacing')?.value };
    return { top: viewport.scrollTop, range: viewport.scrollHeight - viewport.clientHeight,
      ratio: viewport.scrollTop / (viewport.scrollHeight - viewport.clientHeight),
      width: viewport.clientWidth, scrollWidth: viewport.scrollWidth,
      title: document.querySelector('.reader-chapter h2').textContent,
      chapters: document.querySelectorAll('[data-chapter-id]').length };
  })()`)
  const next = () => evaluate(`document.querySelector('.reader-chapter-navigation button:last-child').click()`)
  const previous = () => evaluate(`document.querySelector('.reader-chapter-navigation button:first-child').click()`)
  const key = async (keyCode) => {
    await evaluate(`document.querySelector('.reader-chapter-scroll').focus()`)
    window.webContents.sendInputEvent({ type: 'keyDown', keyCode })
    // Windows generates Space's native scroll from the character event.
    if (keyCode === 'Space') window.webContents.sendInputEvent({ type: 'char', keyCode: ' ' })
    window.webContents.sendInputEvent({ type: 'keyUp', keyCode })
    await delay(350)
  }
  try {
    const style = readFileSync(resolve(__dirname, '../src/renderer/src/styles.css'), 'utf8')
    await window.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(
      `<html><head><style>${style}
        html, body, #root { margin: 0; width: 100%; height: 100%; }
        #root { display: flex; }
      </style></head><body><div id="root"></div></body></html>`))
    const bundle = buildSync({ bundle: true, write: false, platform: 'browser', format: 'iife',
      globalName: 'readerHarness', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"test"' },
      stdin: { resolveDir: resolve(__dirname, '..'), loader: 'jsx', contents: `
        import { createElement, useState } from 'react';
        import { createRoot } from 'react-dom/client';
        import { ChapterReader } from './src/renderer/src/ChapterReader';
        import { ReaderTypographySettings } from './src/renderer/src/ReaderTypographySettings';
        import { DEFAULT_READER_TYPOGRAPHY } from './src/shared/reader-typography';
        import { parseTextBook } from './src/shared/text-chapters';
        const content = '第一卷 起点\\n第一章 初见\\n' + '第一章完整正文。'.repeat(20).concat('\\n').repeat(100)
          + '本章结束标记\\n第二卷 重逢\\n第二章 归来\\n' + '重逢前段正文\\n'.repeat(160)
          + '唯一搜索定位目标\\n' + '重逢后段正文\\n'.repeat(80) + '第三章 尾声\\n这是短章的全部内容。';
        export const book = parseTextBook(content);
        export const events = [];
        let root = createRoot(document.getElementById('root'));
        let instance = 0;
        let options = {};
        const settings = { alwaysOnTop: false, opacity: 1, hideWhenPointerLeaves: false, sidebarHidden: false,
          hideWebMedia: false, textOnlyWeb: false, transparentAppChrome: false,
          bossShortcut: 'CommandOrControl+Shift+H', toolbarCollapsed: false,
          ...DEFAULT_READER_TYPOGRAPHY, readerTheme: 'paper', checkUpdatesOnLaunch: false };
        export const settingsEvents = [];
        function TypographySettingsHarness() {
          const [current, setCurrent] = useState(settings);
          return createElement('div', { className: 'settings-grid', style: { padding: 20, overflow: 'auto', width: '100%' } },
            createElement(ReaderTypographySettings, { settings: current,
              onPreview: (patch) => setCurrent(value => ({ ...value, ...patch })),
              onSave: async (patch) => { settingsEvents.push(patch); setCurrent(value => ({ ...value, ...patch })); } }));
        }
        export function showTypographySettings() { root.render(createElement(TypographySettingsHarness)); }
        const onProgress = (id, progress, position) => events.push({ id, progress, position });
        export function update(patch = {}) {
          options = { ...options, ...patch };
          document.getElementById('root').className = options.transparent ? 'transparent-app-chrome' : '';
          root.render(createElement(ChapterReader, { key: instance,
            document: { content, encoding: 'UTF-8', item: { id: 'test', title: '交互测试',
              fileName: 'test.txt', progress: options.progress || 0, lastOpenedAt: '', readerPosition: options.position } },
            settings: { ...settings, readerFontSize: options.fontSize || settings.readerFontSize,
              readerFontFamily: options.fontFamily || settings.readerFontFamily,
              readerLetterSpacing: options.letterSpacing ?? settings.readerLetterSpacing,
              transparentAppChrome: !!options.transparent },
            searchQuery: options.query || '', onProgress }));
        }
        export function mount(patch = {}) { instance++; options = {}; update(patch); }
        export function unmount() { root.unmount(); root = createRoot(document.getElementById('root')); }
        mount();
      ` } }).outputFiles[0].text
    await evaluate(bundle)
    await evaluate(`globalThis.readerKeys = []; document.addEventListener('keydown', event => {
      setTimeout(() => readerKeys.push({ key: event.key, prevented: event.defaultPrevented }), 0);
    });`)
    await until(`document.querySelector('.reader-chapter-scroll')?.scrollHeight > 2000`)
    await delay(100)
    let state = await read()
    assert.equal(state.chapters, 1)
    assert.equal(state.title, '第一章 初见')
    assert.ok(state.range > 2000)
    assert.ok(state.top < 2)
    assert.equal(state.width, state.scrollWidth)
    assert.equal(await evaluate(`getComputedStyle(document.querySelector('.reader-chapter-scroll')).overflowY`), 'auto')
    assert.equal(await evaluate(`getComputedStyle(document.querySelector('.reader-chapter')).columnWidth`), 'auto')
    assert.equal(await evaluate(`getComputedStyle(document.querySelector('.reader-text')).fontSize`), '20px')
    assert.equal(await evaluate(`getComputedStyle(document.querySelector('.reader-text')).letterSpacing`), '0.8px')
    assert.equal(await evaluate(`getComputedStyle(document.querySelector('.reader-text')).lineHeight`), '40px')
    assert.ok(await evaluate(`getComputedStyle(document.querySelector('.reader-text')).fontFamily.includes('PingFang SC')`))
    await screenshot('reader-default.png')
    await previous()
    assert.equal((await read()).title, '第一章 初见')
    console.log('PASS: whole chapter scrolls vertically; only one chapter is rendered; first-chapter boundary')

    // Native input requires an actually focused window, not just DOM focus.
    window.show()
    window.focus()
    await delay(100)
    window.webContents.sendInputEvent({ type: 'mouseMove', x: 400, y: 300 })
    window.webContents.sendInputEvent({ type: 'mouseWheel', x: 400, y: 300, deltaX: 0, deltaY: -400, canScroll: true })
    await until(`document.querySelector('.reader-chapter-scroll').scrollTop > 10`)
    await delay(250)
    const beforePageDown = (await read()).top
    await key('PageDown')
    await until(`document.querySelector('.reader-chapter-scroll').scrollTop > ${beforePageDown + 10}`)
    assert.equal((await read()).title, '第一章 初见')
    const beforeSpace = (await read()).top
    await key('Space')
    await until(`document.querySelector('.reader-chapter-scroll').scrollTop > ${beforeSpace + 10}`)
    assert.equal((await read()).title, '第一章 初见')
    console.log('PASS: native mouse wheel, PageDown and Space scroll within the current chapter')

    await evaluate(`document.querySelector('.reader-chapter-scroll').scrollTop = 1e9`)
    await delay(300)
    state = await read()
    assert.equal(state.title, '第一章 初见')
    assert.ok(state.ratio > 0.99)
    await next()
    await until(`document.querySelector('.reader-chapter h2').textContent === '第二章 归来' && document.querySelector('.reader-chapter-scroll').scrollTop < 2`)
    await previous()
    await until(`document.querySelector('.reader-chapter h2').textContent === '第一章 初见' && document.querySelector('.reader-chapter-scroll').scrollTop < 2`)
    await key('Right')
    await until(`document.querySelector('.reader-chapter h2').textContent === '第二章 归来'`)
    console.log('PASS: scroll end stays in chapter; footer and arrow keys change chapters from the top')

    await evaluate(`{ const v = document.querySelector('.reader-chapter-scroll'); v.scrollTop = (v.scrollHeight - v.clientHeight) * 0.47; }`)
    await until(`readerHarness.events.at(-1)?.position.chapterStart === readerHarness.book.chapters[1].start && Math.abs(readerHarness.events.at(-1).position.chapterProgress - 0.47) < 0.01`)
    await evaluate(`readerHarness.update({ fontSize: 24 })`)
    await delay(150)
    assert.ok(Math.abs((await read()).ratio - 0.47) < 0.01)
    await evaluate(`readerHarness.update({ fontFamily: 'serif', letterSpacing: 0.12 })`)
    await delay(150)
    assert.ok(Math.abs((await read()).ratio - 0.47) < 0.01)
    assert.equal(await evaluate(`getComputedStyle(document.querySelector('.reader-text')).letterSpacing`), '2.88px')
    assert.ok(await evaluate(`getComputedStyle(document.querySelector('.reader-text')).fontFamily.includes('Songti SC')`))
    await evaluate(`readerHarness.update({ fontFamily: 'sans', letterSpacing: 0 })`)
    await delay(150)
    assert.ok(Math.abs((await read()).ratio - 0.47) < 0.01)
    assert.equal(await evaluate(`getComputedStyle(document.querySelector('.reader-text')).letterSpacing`), 'normal')
    window.setSize(780, 640)
    await delay(150)
    assert.ok(Math.abs((await read()).ratio - 0.47) < 0.01)
    await evaluate(`{ const v = document.querySelector('.reader-chapter-scroll'); v.scrollTop = (v.scrollHeight - v.clientHeight) * 0.68; v.dispatchEvent(new Event('scroll')); readerHarness.unmount(); readerHarness.mount({ position: readerHarness.events.at(-1).position }); }`)
    await until(`document.querySelector('.reader-chapter h2')?.textContent === '第二章 归来' && document.querySelector('.reader-chapter-scroll').scrollTop > 10`)
    await delay(100)
    assert.ok(Math.abs((await read()).ratio - 0.68) < 0.01)
    console.log('PASS: resize/font changes preserve scroll ratio; leaving reader flushes and restores the latest bookmark')

    await evaluate(`readerHarness.mount({ position: { chapterStart: readerHarness.book.chapters[0].start, chapterProgress: 0.75 } })`)
    await delay(150)
    assert.ok(Math.abs((await read()).ratio - 0.75) < 0.01)
    await evaluate(`readerHarness.update({ query: '唯一搜索定位目标' })`)
    await until(`document.querySelector('.reader-chapter h2').textContent === '第二章 归来' && !!document.querySelector('mark')`)
    await delay(150)
    assert.equal(await evaluate(`(() => {
      const v = document.querySelector('.reader-chapter-scroll').getBoundingClientRect();
      const m = document.querySelector('mark').getBoundingClientRect();
      return m.top >= v.top && m.bottom <= v.bottom;
    })()`), true)
    console.log('PASS: v0.1.3 bookmarks remain compatible; cross-chapter search scrolls the match into view')

    await evaluate(`document.querySelector('.chapter-directory-toggle').click()`)
    await until(`!!document.querySelector('.reader-directory')`)
    await evaluate(`[...document.querySelectorAll('.chapter-list button')].find(b => b.textContent === '第三章 尾声').click()`)
    await until(`document.querySelector('.reader-chapter h2').textContent === '第三章 尾声' && !document.querySelector('.reader-directory')`)
    await delay(100)
    assert.equal(await evaluate(`document.querySelector('.reader-chapter-navigation button:last-child').disabled`), true)
    assert.equal(await evaluate(`document.querySelector('.reader-chapter-navigation button:last-child').textContent`), '全书完')
    await key('Right')
    assert.equal((await read()).title, '第三章 尾声')
    assert.equal((await read()).range, 0)
    await until(`readerHarness.events.at(-1)?.progress === 1`)
    await evaluate(`readerHarness.update({ transparent: true })`)
    await delay(100)
    for (const selector of ['.reader-scroll', '.reader-page', '.reader-chapter-navigation']) {
      assert.equal(await evaluate(`getComputedStyle(document.querySelector(${JSON.stringify(selector)})).backgroundColor`), 'rgba(0, 0, 0, 0)')
    }
    await evaluate(`readerHarness.update({ transparent: false })`)
    await delay(100)
    assert.notEqual(await evaluate(`getComputedStyle(document.querySelector('.reader-page')).backgroundColor`), 'rgba(0, 0, 0, 0)')
    console.log('PASS: directory navigation; short final chapter completes; transparent mode toggles correctly')

    await evaluate(`readerHarness.showTypographySettings()`)
    await until(`!!document.querySelector('#readerFontFamily')`)
    assert.equal(await evaluate(`(() => {
      const card = document.querySelector('.reader-font-settings');
      return card.lastElementChild.getBoundingClientRect().bottom <= card.getBoundingClientRect().bottom - 8;
    })()`), true)
    await evaluate(`{ const select = document.querySelector('#readerFontFamily'); select.value = 'kai'; select.dispatchEvent(new Event('change', { bubbles: true })); }`)
    await until(`readerHarness.settingsEvents.at(-1)?.readerFontFamily === 'kai'`)
    assert.ok(await evaluate(`getComputedStyle(document.querySelector('.reader-typography-preview')).fontFamily.includes('KaiTi')`))
    await evaluate(`{ const input = document.querySelector('#readerLetterSpacing');
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, '0.1');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    }`)
    await until(`readerHarness.settingsEvents.at(-1)?.readerLetterSpacing === 0.1`)
    await until(`getComputedStyle(document.querySelector('.reader-typography-preview')).letterSpacing === '2px'`)
    await evaluate(`document.querySelector('.reader-preset-button').click()`)
    await until(`readerHarness.settingsEvents.at(-1)?.readerFontFamily === 'sans' && readerHarness.settingsEvents.at(-1)?.readerLetterSpacing === 0.04`)
    await until(`document.querySelector('#readerFontFamily').value === 'sans'`)
    assert.equal(await evaluate(`document.querySelector('#readerFontSize').value`), '20')
    assert.equal(await evaluate(`getComputedStyle(document.querySelector('.reader-typography-preview')).letterSpacing`), '0.8px')
    assert.equal(await evaluate(`document.querySelector('.settings-grid').scrollWidth > document.querySelector('.settings-grid').clientWidth`), false)
    await screenshot('reader-typography-settings.png')
    await evaluate(`document.querySelector('.reader-typography-settings').scrollIntoView({ block: 'end' })`)
    assert.equal(await evaluate(`(() => {
      const grid = document.querySelector('.settings-grid').getBoundingClientRect();
      const preview = document.querySelector('.reader-typography-preview').getBoundingClientRect();
      return preview.top >= grid.top && preview.bottom <= grid.bottom;
    })()`), true)
    await screenshot('reader-typography-preview.png')
    console.log('PASS: font and letter-spacing controls save actual values, preview updates and recommended preset restores defaults')
    console.log('All native Chromium chapter reader interaction checks passed.')
  } finally {
    clearTimeout(timeout)
    window.destroy()
  }
}).then(() => app.exit(0)).catch((error) => { console.error(error); app.exit(1) })
