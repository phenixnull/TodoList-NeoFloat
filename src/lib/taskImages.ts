import type { TaskImageAttachment } from '../types/domain'

export const TASK_IMAGE_SRC_PREFIX = 'task-image:'
const TASK_IMAGE_MARKDOWN_PATTERN = /!\[[^\]]*\]\((task-image:[\w-]+)\)/g
const TASK_IMAGE_EDITOR_LABEL = '\u56fe\u7247'

export interface TaskImageEditorSegment {
  type: 'text' | 'image'
  rawText: string
  displayText: string
  attachmentId: string | null
}

export function buildTaskImageMarkdown(attachmentId: string): string {
  return `![${TASK_IMAGE_EDITOR_LABEL}](${TASK_IMAGE_SRC_PREFIX}${attachmentId})`
}

export function buildTaskImageEditorToken(displayIndex: number): string {
  return `![${TASK_IMAGE_EDITOR_LABEL}#${displayIndex}]`
}

export function parseTaskImageId(src: string | null | undefined): string | null {
  if (!src || !src.startsWith(TASK_IMAGE_SRC_PREFIX)) {
    return null
  }
  const imageId = src.slice(TASK_IMAGE_SRC_PREFIX.length).trim()
  return imageId || null
}

export function collectReferencedTaskImageIds(content: string): string[] {
  const ids = new Set<string>()
  let match = TASK_IMAGE_MARKDOWN_PATTERN.exec(content)
  while (match) {
    const imageId = parseTaskImageId(match[1])
    if (imageId) {
      ids.add(imageId)
    }
    match = TASK_IMAGE_MARKDOWN_PATTERN.exec(content)
  }
  TASK_IMAGE_MARKDOWN_PATTERN.lastIndex = 0
  return [...ids]
}

export function pruneTaskImageAttachments(content: string, attachments: TaskImageAttachment[]): TaskImageAttachment[] {
  const referencedIds = new Set(collectReferencedTaskImageIds(content))
  return attachments.filter((attachment) => referencedIds.has(attachment.id))
}

export function buildTaskImageEditorSegments(content: string, attachments: TaskImageAttachment[]): TaskImageEditorSegment[] {
  if (!content) {
    return []
  }

  const indexById = new Map(attachments.map((attachment, index) => [attachment.id, index + 1]))
  const segments: TaskImageEditorSegment[] = []
  let cursor = 0
  let match = TASK_IMAGE_MARKDOWN_PATTERN.exec(content)

  while (match) {
    const [rawText, imageSrc] = match
    const imageId = parseTaskImageId(imageSrc)
    const hasAttachment = imageId ? indexById.has(imageId) : false

    if (!hasAttachment) {
      match = TASK_IMAGE_MARKDOWN_PATTERN.exec(content)
      continue
    }

    if (match.index > cursor) {
      const plainText = content.slice(cursor, match.index)
      segments.push({
        type: 'text',
        rawText: plainText,
        displayText: plainText,
        attachmentId: null,
      })
    }

    const displayText = buildTaskImageEditorToken(indexById.get(imageId as string) as number)
    segments.push({
      type: 'image',
      rawText,
      displayText,
      attachmentId: imageId,
    })
    cursor = match.index + rawText.length
    match = TASK_IMAGE_MARKDOWN_PATTERN.exec(content)
  }

  if (cursor < content.length) {
    const plainText = content.slice(cursor)
    segments.push({
      type: 'text',
      rawText: plainText,
      displayText: plainText,
      attachmentId: null,
    })
  }

  TASK_IMAGE_MARKDOWN_PATTERN.lastIndex = 0
  return segments
}

export function buildTaskImageEditorText(content: string, attachments: TaskImageAttachment[]): string {
  const segments = buildTaskImageEditorSegments(content, attachments)
  if (segments.length === 0) {
    return content
  }
  return segments.map((segment) => segment.displayText).join('')
}

export function buildTaskImageRawTextFromEditorText(content: string, attachments: TaskImageAttachment[]): string {
  return attachments.reduce((nextContent, attachment, index) => {
    const editorToken = buildTaskImageEditorToken(index + 1)
    const rawToken = buildTaskImageMarkdown(attachment.id)
    return nextContent.split(editorToken).join(rawToken)
  }, content)
}

export function mapTaskImageEditorOffsetToRaw(content: string, attachments: TaskImageAttachment[], displayOffset: number): number {
  const safeOffset = Math.max(0, displayOffset)
  const segments = buildTaskImageEditorSegments(content, attachments)
  if (segments.length === 0) {
    return Math.min(safeOffset, content.length)
  }

  let rawCursor = 0
  let displayCursor = 0

  for (const segment of segments) {
    const rawLength = segment.rawText.length
    const displayLength = segment.displayText.length

    if (safeOffset <= displayCursor + displayLength) {
      const innerOffset = Math.max(0, safeOffset - displayCursor)
      if (segment.type === 'text') {
        return rawCursor + Math.min(innerOffset, rawLength)
      }
      return rawCursor + (innerOffset <= displayLength / 2 ? 0 : rawLength)
    }

    rawCursor += rawLength
    displayCursor += displayLength
  }

  return content.length
}

export function insertTextAtSelection(content: string, insertedText: string, selectionStart: number, selectionEnd: number): string {
  const safeStart = Math.max(0, Math.min(selectionStart, content.length))
  const safeEnd = Math.max(safeStart, Math.min(selectionEnd, content.length))
  return `${content.slice(0, safeStart)}${insertedText}${content.slice(safeEnd)}`
}
