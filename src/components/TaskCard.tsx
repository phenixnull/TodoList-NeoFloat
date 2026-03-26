import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { CSS } from '@dnd-kit/utilities'
import { useSortable } from '@dnd-kit/sortable'
import clsx from 'clsx'
import ReactMarkdown, { defaultUrlTransform } from 'react-markdown'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import type { Components } from 'react-markdown'
import type { Task, TaskCardMode, TaskContentDisplayMode, TaskPaletteMode } from '../types/domain'
import { markdownWithHardBreaks } from '../lib/math'
import { parseTaskImageId, TASK_IMAGE_SRC_PREFIX } from '../lib/taskImages'

type TaskCardProps = {
  task: Task
  displayOrder: number
  cardMode: TaskCardMode
  contentDisplayMode: TaskContentDisplayMode
  paletteMode: TaskPaletteMode
  layoutPulse?: number
  onContentChange: (taskId: string, value: string) => void
  onPasteImage: (taskId: string, file: File, selectionStart: number, selectionEnd: number) => Promise<void>
  onToggleStartPause: (taskId: string) => void
  onFinish: (taskId: string) => void
  onOpenContextMenu: (taskId: string, position: { x: number; y: number }) => void
}

const LABEL_FINISHED = '\u5df2\u5b8c\u6210'
const LABEL_UNFINISHED = '\u672a\u5b8c\u6210'
const LABEL_ARCHIVED = '\u5df2\u5f52\u6863'
const LABEL_EMPTY_TASK = '\u8f93\u5165\u4efb\u52a1\uff08\u652f\u6301 $x$\u3001$$x^2$$\u3001\u7c98\u8d34\u56fe\u7247\uff09'
const LABEL_IMAGE_LOADING = '\u56fe\u7247\u52a0\u8f7d\u4e2d'
const LABEL_OPEN_IMAGE = '\u70b9\u51fb\u6253\u5f00\u56fe\u7247'
const LABEL_TASK_IMAGE = '\u4efb\u52a1\u56fe\u7247'

function colorFromOrder(task: Task, displayOrder: number, paletteMode: TaskPaletteMode): string {
  if ((task.colorMode === 'preset' || task.colorMode === 'custom') && task.colorValue) {
    return task.colorValue
  }
  if (paletteMode === 'gray-gradient' || paletteMode === 'default-gray') {
    return 'linear-gradient(135deg, hsl(220 8% 36%), hsl(220 8% 23%), hsl(220 8% 14%))'
  }
  return vividGradientFromOrder(displayOrder)
}

function vividGradientFromOrder(displayOrder: number): string {
  const baseHue = ((displayOrder - 1) * 137.508) % 360
  return `linear-gradient(128deg, hsl(${baseHue} 88% 58%), hsl(${(baseHue + 72) % 360} 85% 54%), hsl(${(baseHue + 152) % 360} 90% 61%))`
}

function taskMarkdownUrlTransform(url: string): string {
  if (url.startsWith(TASK_IMAGE_SRC_PREFIX)) {
    return url
  }
  return defaultUrlTransform(url)
}

export function TaskCard({
  task,
  displayOrder,
  cardMode,
  contentDisplayMode,
  paletteMode,
  layoutPulse = 0,
  onContentChange,
  onPasteImage,
  onToggleStartPause,
  onFinish,
  onOpenContextMenu,
}: TaskCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id })
  const editorRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const previewRef = useRef<HTMLDivElement>(null)
  const resizeRafRef = useRef<number | null>(null)
  const settleRafRef = useRef<number | null>(null)
  const lastObservedWidthRef = useRef<number | null>(null)
  const [layoutTick, setLayoutTick] = useState(0)
  const [isEditing, setIsEditing] = useState(false)
  const [imageDataUrls, setImageDataUrls] = useState<Record<string, string>>({})
  const [imageLoadTick, setImageLoadTick] = useState(0)

  const isCollapsed = cardMode === 'collapsed'
  const isInnerScrollMode = contentDisplayMode === 'inner-scroll'
  const isDoing = task.status === 'doing'
  const isFinished = task.status === 'finished'
  const isArchived = task.archived
  const isGrayPalette = paletteMode === 'gray-gradient' || paletteMode === 'default-gray'
  const completionLabel = isFinished ? LABEL_FINISHED : LABEL_UNFINISHED
  const completionClass = isFinished ? 'finished' : 'unfinished'
  const previewText = task.contentRaw.trim() ? task.contentRaw : LABEL_EMPTY_TASK
  const startPauseIcon = isDoing ? '||' : '\u25b6'
  const scheduleLayoutRecalc = useCallback(() => {
    if (resizeRafRef.current !== null) {
      cancelAnimationFrame(resizeRafRef.current)
    }
    if (settleRafRef.current !== null) {
      cancelAnimationFrame(settleRafRef.current)
      settleRafRef.current = null
    }
    // Triple RAF for CJK font loading (50-100ms)
    resizeRafRef.current = requestAnimationFrame(() => {
      resizeRafRef.current = null
      setLayoutTick((value) => value + 1)
      settleRafRef.current = requestAnimationFrame(() => {
        settleRafRef.current = null
        setLayoutTick((value) => value + 1)
        // Third frame for font metrics stabilization
        requestAnimationFrame(() => {
          setLayoutTick((value) => value + 1)
        })
      })
    })
  }, [])

  useEffect(() => {
    let cancelled = false

    async function loadImages() {
      if (!window.todoAPI || task.attachments.length === 0) {
        setImageDataUrls({})
        return
      }

      const entries = await Promise.all(
        task.attachments.map(async (attachment) => {
          const dataUrl = await window.todoAPI?.readTaskImageDataUrl(attachment.storagePath)
          return [attachment.id, dataUrl ?? ''] as const
        }),
      )

      if (cancelled) {
        return
      }

      setImageDataUrls(Object.fromEntries(entries.filter((entry) => entry[1])) as Record<string, string>)
    }

    void loadImages()
    return () => {
      cancelled = true
    }
  }, [task.attachments])

  // 监听 Markdown 渲染完成（带防抖）
  useEffect(() => {
    const previewEl = previewRef.current
    if (!previewEl || typeof MutationObserver === 'undefined') {
      return
    }

    let debounceTimer: ReturnType<typeof setTimeout> | null = null
    const observer = new MutationObserver(() => {
      if (debounceTimer !== null) {
        clearTimeout(debounceTimer)
      }
      debounceTimer = setTimeout(() => {
        scheduleLayoutRecalc()
      }, 50)
    })

    observer.observe(previewEl, {
      childList: true,
      subtree: true,
    })

    return () => {
      observer.disconnect()
      if (debounceTimer !== null) {
        clearTimeout(debounceTimer)
      }
    }
  }, [scheduleLayoutRecalc])

  useEffect(() => {
    const editorEl = editorRef.current
    if (!editorEl || typeof ResizeObserver === 'undefined') {
      return
    }

    const observer = new ResizeObserver((entries) => {
      const nextWidth = entries[0]?.contentRect.width ?? editorEl.clientWidth
      const prevWidth = lastObservedWidthRef.current
      if (prevWidth !== null && Math.abs(nextWidth - prevWidth) < 1) {
        return
      }
      lastObservedWidthRef.current = nextWidth

      scheduleLayoutRecalc()
    })

    observer.observe(editorEl)

    return () => {
      observer.disconnect()
      if (resizeRafRef.current !== null) {
        cancelAnimationFrame(resizeRafRef.current)
        resizeRafRef.current = null
      }
      if (settleRafRef.current !== null) {
        cancelAnimationFrame(settleRafRef.current)
        settleRafRef.current = null
      }
    }
  }, [scheduleLayoutRecalc])

  useEffect(() => {
    if (layoutPulse <= 0) {
      return
    }
    scheduleLayoutRecalc()
  }, [layoutPulse, scheduleLayoutRecalc])

  useLayoutEffect(() => {
    const editorEl = editorRef.current
    const inputEl = inputRef.current
    const previewEl = previewRef.current
    if (!editorEl || !inputEl || !previewEl) {
      return
    }

    const minHeight = isCollapsed ? 28 : 52
    const maxHeight = isInnerScrollMode ? (isCollapsed ? 72 : 180) : Number.POSITIVE_INFINITY

    const prevInputMinHeight = inputEl.style.minHeight
    const prevPreviewMinHeight = previewEl.style.minHeight
    const prevPreviewHeight = previewEl.style.height

    // Measure intrinsic content height instead of current stretched height.
    inputEl.style.minHeight = '0px'
    previewEl.style.minHeight = '0px'
    previewEl.style.height = 'auto'
    inputEl.style.height = '0px'

    // 强制浏览器完成渲染（关键修复：避免测量时DOM未稳定）
    void previewEl.offsetHeight

    // Use getBoundingClientRect for more accurate measurement with floated content
    const inputHeight = Math.ceil(inputEl.scrollHeight)
    const previewScrollHeight = Math.ceil(previewEl.scrollHeight)
    const previewBoundingHeight = Math.ceil(previewEl.getBoundingClientRect().height)
    // Take the maximum to handle floated images and cleared content
    const previewHeight = Math.max(previewScrollHeight, previewBoundingHeight)

    // Keep auto-height anchored to rendered preview content so width changes
    // do not drift from textarea line-wrap differences.
    const preferredHeight = previewHeight
    const fallbackHeight = inputHeight
    const autoHeightBuffer = isInnerScrollMode ? 0 : 0
    const measuredHeight = preferredHeight > 0 ? preferredHeight : fallbackHeight
    const contentHeight = Math.max(minHeight, measuredHeight + autoHeightBuffer)
    const nextHeight = Math.max(minHeight, Math.min(maxHeight, contentHeight))
    const shouldScroll = isInnerScrollMode && contentHeight > maxHeight

    editorEl.style.setProperty('--live-editor-height', `${nextHeight}px`)
    inputEl.style.height = `${nextHeight}px`
    inputEl.style.overflowY = shouldScroll ? 'auto' : 'hidden'
    previewEl.style.overflowY = shouldScroll ? 'auto' : 'hidden'
    inputEl.style.minHeight = prevInputMinHeight
    previewEl.style.minHeight = prevPreviewMinHeight
    previewEl.style.height = prevPreviewHeight
  }, [imageDataUrls, imageLoadTick, isCollapsed, isEditing, isInnerScrollMode, layoutTick, task.attachments, task.contentRaw, task.fontSize, task.fontFamily])

  const markdownComponents = useMemo<Components>(
    () => ({
      img: ({ src = '', alt = '' }) => {
        const imageId = parseTaskImageId(src)
        if (!imageId) {
          return null
        }

        const attachment = task.attachments.find((item) => item.id === imageId)
        const imageSrc = imageDataUrls[imageId]
        if (!attachment || !imageSrc) {
          return <span className="task-inline-image task-inline-image-missing">{LABEL_IMAGE_LOADING}</span>
        }

        return (
          <button
            type="button"
            className="task-inline-image"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.preventDefault()
              event.stopPropagation()
              void window.todoAPI?.openTaskImage(attachment.storagePath)
            }}
            title={LABEL_OPEN_IMAGE}
          >
            <img src={imageSrc} alt={alt || LABEL_TASK_IMAGE} onLoad={() => setImageLoadTick((value) => value + 1)} />
          </button>
        )
      },
    }),
    [imageDataUrls, task.attachments],
  )

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    '--task-gradient': colorFromOrder(task, displayOrder, paletteMode),
    '--task-doing-gradient': vividGradientFromOrder(displayOrder),
  } as CSSProperties

  const stopDragPropagation = (event: { stopPropagation: () => void }) => {
    event.stopPropagation()
  }

  const activateEditing = () => {
    if (isArchived || isFinished) {
      return
    }
    setIsEditing(true)
    requestAnimationFrame(() => {
      inputRef.current?.focus()
    })
  }

  const handlePaste = async (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const imageItem = Array.from(event.clipboardData.items).find((item) => item.type.startsWith('image/'))
    if (!imageItem) {
      return
    }

    const file = imageItem.getAsFile()
    const inputEl = inputRef.current
    if (!file || !inputEl) {
      return
    }

    event.preventDefault()
    await onPasteImage(task.id, file, inputEl.selectionStart, inputEl.selectionEnd)
  }

  return (
    <article
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onContextMenu={(event) => {
        event.preventDefault()
        onOpenContextMenu(task.id, {
          x: event.clientX,
          y: event.clientY,
        })
      }}
      className={clsx('task-card', {
        doing: isDoing,
        finished: isFinished,
        archived: isArchived,
        dragging: isDragging,
        'mode-collapsed': isCollapsed,
        'mode-expanded': !isCollapsed,
        'content-inner-scroll': isInnerScrollMode,
        'content-auto-height': !isInnerScrollMode,
        'palette-gray': isGrayPalette,
        'palette-vivid': !isGrayPalette,
      })}
    >
      <section className="task-core-row">
        <div className="seq-handle" aria-hidden>
          #{displayOrder}
        </div>

        <div
          ref={editorRef}
          className={clsx('live-editor', {
            finished: isFinished,
            'is-editing': isEditing,
          })}
          style={{
            fontFamily: task.fontFamily,
            fontSize: `${task.fontSize}px`,
          }}
          onPointerDown={stopDragPropagation}
          onClick={(event) => {
            const target = event.target as HTMLElement
            if (target.closest('.task-inline-image')) {
              return
            }
            activateEditing()
          }}
        >
          <div
            ref={previewRef}
            className={clsx('live-preview', {
              empty: !task.contentRaw.trim(),
              finished: isFinished,
            })}
          >
            <ReactMarkdown
              components={markdownComponents}
              remarkPlugins={[remarkMath]}
              rehypePlugins={[rehypeKatex]}
              urlTransform={taskMarkdownUrlTransform}
            >
              {markdownWithHardBreaks(previewText)}
            </ReactMarkdown>
          </div>

          <textarea
            ref={inputRef}
            className="live-input"
            value={task.contentRaw}
            onChange={(event) => onContentChange(task.id, event.target.value)}
            onPaste={(event) => void handlePaste(event)}
            onPointerDown={stopDragPropagation}
            onFocus={() => setIsEditing(true)}
            onBlur={() => setIsEditing(false)}
            aria-label={`Task ${displayOrder}`}
            readOnly={isFinished || isArchived}
          />

          {isFinished || isArchived ? (
            <div className="status-stack" aria-hidden>
              <span className={clsx('status-flag', 'leading', completionClass)}>{completionLabel}</span>
              {isArchived ? <span className="status-flag archived">{LABEL_ARCHIVED}</span> : null}
            </div>
          ) : null}
        </div>

        <div className="action-stack" onPointerDown={stopDragPropagation}>
          <button
            type="button"
            className={clsx('btn-mini btn-start', {
              doing: isDoing,
            })}
            disabled={isFinished || isArchived}
            onPointerDown={stopDragPropagation}
            onClick={() => onToggleStartPause(task.id)}
            aria-label={isDoing ? 'Pause' : 'Start'}
            title={isDoing ? 'Pause' : 'Start'}
          >
            <span className={clsx('state-icon', isDoing ? 'pause' : 'play')}>{startPauseIcon}</span>
            {!isCollapsed ? (isDoing ? 'Pause' : 'Start') : null}
          </button>

          <button
            type="button"
            className="btn-mini btn-finish"
            disabled={isFinished || isArchived}
            onPointerDown={stopDragPropagation}
            onClick={() => onFinish(task.id)}
            aria-label="Finished"
            title="Finished"
          >
            {isCollapsed ? '\u25a0' : 'Finished'}
          </button>
        </div>
      </section>
    </article>
  )
}
