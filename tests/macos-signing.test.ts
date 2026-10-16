import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const config = require('../package.json').build

it('uses certificate-free ad-hoc signing without incompatible hardened runtime or notarization', () => {
  expect(config.mac.identity).toBe('-')
  expect(config.mac.hardenedRuntime).toBe(false)
  expect(config.mac.notarize).toBe(false)
})

it('does not let PR signing skips silently publish unverified macOS installers', () => {
  const workflow = readFileSync(new URL('../.github/workflows/packages.yml', import.meta.url), 'utf8')
  expect(workflow).toContain("CSC_IDENTITY_AUTO_DISCOVERY: 'false'")
  expect(workflow).toContain("CSC_FOR_PULL_REQUEST: ${{ matrix.platform == 'mac' && 'true' || 'false' }}")
  expect(workflow).toContain('node scripts/verify-macos-dmg.cjs')
  expect(workflow).not.toContain('secrets.')
})
