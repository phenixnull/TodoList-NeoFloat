const fs = require('node:fs/promises')
const path = require('node:path')

function normalizeTaskAttachments(attachments) {
  if (!Array.isArray(attachments)) {
    return []
  }

  return attachments.filter((attachment) => {
    return (
      attachment &&
      typeof attachment.id === 'string' &&
      typeof attachment.storagePath === 'string' &&
      typeof attachment.mimeType === 'string' &&
      typeof attachment.createdAt === 'string'
    )
  })
}

async function walkTaskAssetFiles(directory) {
  let entries = []
  try {
    entries = await fs.readdir(directory, { withFileTypes: true })
  } catch {
    return []
  }

  const files = []
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await walkTaskAssetFiles(entryPath)))
      continue
    }
    if (entry.isFile()) {
      files.push(entryPath)
    }
  }
  return files
}

async function removeEmptyTaskAssetDirectories(directory) {
  let entries = []
  try {
    entries = await fs.readdir(directory, { withFileTypes: true })
  } catch {
    return
  }

  await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => {
        const entryPath = path.join(directory, entry.name)
        await removeEmptyTaskAssetDirectories(entryPath)
        const remaining = await fs.readdir(entryPath)
        if (remaining.length === 0) {
          await fs.rmdir(entryPath)
        }
      }),
  )
}

async function cleanupTaskAssetFiles({ dataDir, taskAssetsDir, state }) {
  const referencedPaths = new Set()
  for (const task of Array.isArray(state?.tasks) ? state.tasks : []) {
    for (const attachment of normalizeTaskAttachments(task.attachments)) {
      referencedPaths.add(attachment.storagePath.replace(/\\/g, '/'))
    }
  }

  const files = await walkTaskAssetFiles(taskAssetsDir)
  for (const filePath of files) {
    const relativePath = path.relative(dataDir, filePath).replace(/\\/g, '/')
    if (!referencedPaths.has(relativePath)) {
      await fs.rm(filePath, { force: true })
    }
  }

  await removeEmptyTaskAssetDirectories(taskAssetsDir)
}

module.exports = {
  cleanupTaskAssetFiles,
}
