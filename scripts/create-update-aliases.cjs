const { copyFile, mkdir, readdir } = require('node:fs/promises')
const { join } = require('node:path')

function legacyName(name, version) {
  const prefix = `StealthReader-${version}-`
  if (!name.startsWith(prefix)) return null
  const tail = name.slice(prefix.length)
  const mac = /^macos-(arm64|x64|universal)\.dmg$/.exec(tail)
  if (mac) return `Stealth-Reader-${version}-${mac[1]}.dmg`
  const win = /^windows-(arm64|x64)-(setup|portable)\.exe$/.exec(tail)
  if (win) return `Stealth-Reader-${win[2] === 'setup' ? 'Setup' : 'Portable'}-${version}-${win[1]}.exe`
  return null
}

async function createUpdateAliases(directory, version) {
  const aliases = []
  for (const name of await readdir(directory)) {
    const alias = legacyName(name, version)
    if (!alias) continue
    const destination = join(directory, 'update-compat')
    await mkdir(destination, { recursive: true })
    await copyFile(join(directory, name), join(destination, alias))
    aliases.push(alias)
  }
  if (aliases.length === 0) throw new Error('No standard-named installers found for update compatibility')
  return aliases
}

module.exports = { legacyName, createUpdateAliases }
if (require.main === module) {
  const version = require('../package.json').version
  createUpdateAliases('release', version).then(aliases => console.log('Legacy updater aliases:', aliases.join(', ')))
    .catch(error => { console.error(error); process.exitCode = 1 })
}
