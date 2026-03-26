const path = require('node:path')

function resolveRuntimePaths({ appIsPackaged, cwd, defaultUserDataDir, portableExecutableDir }) {
  const normalizedCwd = path.resolve(String(cwd || process.cwd()))
  const normalizedDefaultUserDataDir = path.resolve(String(defaultUserDataDir || path.join(normalizedCwd, '.runtime', 'electron')))
  const normalizedPortableExecutableDir = String(portableExecutableDir || '').trim()
    ? path.resolve(String(portableExecutableDir).trim())
    : ''

  if (!appIsPackaged) {
    const userDataDir = path.join(normalizedCwd, '.runtime', 'electron')
    return {
      isPortable: false,
      userDataDir,
      dataDir: path.join(normalizedCwd, 'data'),
      cacheDir: path.join(userDataDir, 'Cache'),
    }
  }

  if (normalizedPortableExecutableDir) {
    const userDataDir = path.join(normalizedPortableExecutableDir, '.runtime', 'electron')
    return {
      isPortable: true,
      userDataDir,
      dataDir: path.join(normalizedPortableExecutableDir, 'data'),
      cacheDir: path.join(userDataDir, 'Cache'),
    }
  }

  return {
    isPortable: false,
    userDataDir: normalizedDefaultUserDataDir,
    dataDir: path.join(normalizedDefaultUserDataDir, 'data'),
    cacheDir: path.join(normalizedDefaultUserDataDir, 'Cache'),
  }
}

module.exports = {
  resolveRuntimePaths,
}
