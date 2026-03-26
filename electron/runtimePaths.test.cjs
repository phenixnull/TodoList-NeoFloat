const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')

const { resolveRuntimePaths } = require('./runtimePaths.cjs')

test('resolveRuntimePaths keeps dev data inside the project directory', () => {
  const cwd = path.join('D:', 'workspace', 'todo')
  const paths = resolveRuntimePaths({
    appIsPackaged: false,
    cwd,
    defaultUserDataDir: path.join('C:', 'Users', 'Administrator', 'AppData', 'Roaming', 'todolist-floating-app'),
    portableExecutableDir: '',
  })

  assert.equal(paths.isPortable, false)
  assert.equal(paths.userDataDir, path.join(cwd, '.runtime', 'electron'))
  assert.equal(paths.dataDir, path.join(cwd, 'data'))
  assert.equal(paths.cacheDir, path.join(cwd, '.runtime', 'electron', 'Cache'))
})

test('resolveRuntimePaths keeps portable builds next to the executable', () => {
  const portableExecutableDir = path.join('D:', 'Users', 'Administrator', 'Desktop')
  const paths = resolveRuntimePaths({
    appIsPackaged: true,
    cwd: path.join('D:', 'workspace', 'todo'),
    defaultUserDataDir: path.join('C:', 'Users', 'Administrator', 'AppData', 'Roaming', 'todolist-floating-app'),
    portableExecutableDir,
  })

  assert.equal(paths.isPortable, true)
  assert.equal(paths.userDataDir, path.join(portableExecutableDir, '.runtime', 'electron'))
  assert.equal(paths.dataDir, path.join(portableExecutableDir, 'data'))
  assert.equal(paths.cacheDir, path.join(portableExecutableDir, '.runtime', 'electron', 'Cache'))
})

test('resolveRuntimePaths keeps installed builds in the default userData directory', () => {
  const defaultUserDataDir = path.join('C:', 'Users', 'Administrator', 'AppData', 'Roaming', 'todolist-floating-app')
  const paths = resolveRuntimePaths({
    appIsPackaged: true,
    cwd: path.join('D:', 'workspace', 'todo'),
    defaultUserDataDir,
    portableExecutableDir: '',
  })

  assert.equal(paths.isPortable, false)
  assert.equal(paths.userDataDir, defaultUserDataDir)
  assert.equal(paths.dataDir, path.join(defaultUserDataDir, 'data'))
  assert.equal(paths.cacheDir, path.join(defaultUserDataDir, 'Cache'))
})
