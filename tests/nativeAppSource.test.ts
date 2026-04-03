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
