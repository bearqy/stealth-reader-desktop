import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import type { UpdateState } from '../src/shared/contracts'
import { UpdatePanel } from '../src/renderer/src/UpdatePanel'

const downloaded: UpdateState = { currentVersion: '0.1.5', system: 'macOS', architecture: 'arm64',
  packageType: 'dmg', canInstall: true, status: 'downloaded', message: '下载已校验',
  latest: null, checkedAt: null, progress: null }

it('offers restart installation for a verified Mac download', () => {
  const state = downloaded
  const html = renderToStaticMarkup(createElement(UpdatePanel, { state, onState: () => undefined }))
  expect(html).toContain('重启并安装更新')
  expect(html).not.toContain('打开安装包并退出')
})

it('keeps the portable Windows workflow separate', () => {
  const state: UpdateState = { ...downloaded, system: 'Windows', architecture: 'x64', packageType: 'portable' }
  const html = renderToStaticMarkup(createElement(UpdatePanel, { state, onState: () => undefined }))
  expect(html).toContain('打开安装包位置')
  expect(html).not.toContain('重启并安装更新')
})
