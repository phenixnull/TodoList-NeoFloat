import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const nativeAppRoot = path.resolve('native-app')

test('native app source branch includes an Expo app wired to the repo workspace', () => {
  const packageJsonPath = path.join(nativeAppRoot, 'package.json')
  const metroConfigPath = path.join(nativeAppRoot, 'metro.config.js')
  const appEntryPath = path.join(nativeAppRoot, 'src', 'app', 'NativeTodoApp.tsx')

  assert.equal(existsSync(packageJsonPath), true)
  assert.equal(existsSync(metroConfigPath), true)
  assert.equal(existsSync(appEntryPath), true)

  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as {
    dependencies?: Record<string, string>
    scripts?: Record<string, string>
  }
  const metroConfig = readFileSync(metroConfigPath, 'utf8')

  assert.equal(typeof packageJson.dependencies?.expo, 'string')
  assert.equal(typeof packageJson.dependencies?.['react-native'], 'string')
  assert.equal(typeof packageJson.scripts?.android, 'string')
  assert.match(metroConfig, /watchFolders/)
})

test('native task strip keeps default paused rows neutral and centers the editor overlay', () => {
  const appEntryPath = path.join(nativeAppRoot, 'src', 'app', 'NativeTodoApp.tsx')
  const appEntry = readFileSync(appEntryPath, 'utf8')

  assert.match(appEntry, /function taskUserAccent/)
  assert.match(appEntry, /function taskSignalAccent/)
  assert.doesNotMatch(appEntry, /if \(task\.status === 'paused'\) return '#f59e0b'/)
  assert.doesNotMatch(appEntry, /if \(task\.status === 'doing'\) return '#22c55e'/)
  assert.match(appEntry, /KeyboardAvoidingView/)
  assert.match(appEntry, /animationType="fade"/)
  assert.match(appEntry, /editorOverlay/)
  assert.match(appEntry, /position: 'absolute', left: 4, right: 4, bottom: 3/)
})
