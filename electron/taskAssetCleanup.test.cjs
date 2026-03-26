const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')

const { cleanupTaskAssetFiles } = require('./taskAssetCleanup.cjs')

test('cleanupTaskAssetFiles removes orphaned task assets but preserves referenced files', async () => {
  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'todo-task-assets-'))
  const dataDir = path.join(tmpRoot, 'data')
  const taskAssetsDir = path.join(dataDir, 'task-assets')
  const taskDir = path.join(taskAssetsDir, 'task-1')
  const orphanDir = path.join(taskAssetsDir, 'task-2')

  await fs.mkdir(taskDir, { recursive: true })
  await fs.mkdir(orphanDir, { recursive: true })

  const keptRelativePath = 'task-assets/task-1/kept.png'
  const keptAbsolutePath = path.join(dataDir, keptRelativePath)
  const orphanAbsolutePath = path.join(orphanDir, 'orphan.png')

  await fs.writeFile(keptAbsolutePath, 'kept', 'utf8')
  await fs.writeFile(orphanAbsolutePath, 'orphan', 'utf8')

  await cleanupTaskAssetFiles({
    dataDir,
    taskAssetsDir,
    state: {
      tasks: [
        {
          attachments: [
            {
              id: 'img-1',
              storagePath: keptRelativePath,
              mimeType: 'image/png',
              createdAt: '2026-03-12T10:00:00.000+08:00',
            },
          ],
        },
      ],
    },
  })

  await assert.doesNotReject(() => fs.access(keptAbsolutePath))
  await assert.rejects(() => fs.access(orphanAbsolutePath))
  await assert.rejects(() => fs.access(orphanDir))
  await fs.rm(tmpRoot, { recursive: true, force: true })
})
