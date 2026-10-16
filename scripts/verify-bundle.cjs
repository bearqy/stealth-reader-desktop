const assert = require('node:assert/strict')
const { readFileSync, readdirSync } = require('node:fs')
const { join, relative } = require('node:path')
const { extractFile } = require('@electron/asar')

const archive = process.argv[2]
assert(archive, 'Usage: node scripts/verify-bundle.cjs <app.asar>')
const source = JSON.parse(readFileSync('package.json', 'utf8'))
const packaged = JSON.parse(extractFile(archive, 'package.json').toString('utf8'))
assert.equal(packaged.name, source.name, 'Wrong application in package')
assert.equal(packaged.version, source.version, 'Packaged version differs from source')

function verifyDirectory(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const file = join(directory, entry.name)
    if (entry.isDirectory()) verifyDirectory(file)
    else {
      const path = relative('.', file).split('\\').join('/')
      assert.deepEqual(extractFile(archive, path), readFileSync(file), `Stale packaged file: ${path}`)
    }
  }
}
verifyDirectory('out')
console.log(`Verified ${source.name} v${source.version}: packaged output matches the current build`)
