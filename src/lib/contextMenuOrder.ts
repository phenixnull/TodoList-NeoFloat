export const DEFAULT_CONTEXT_MENU_ORDER = [
  'stats',
  'toggle-duration',
  'toggle-all-durations',
  'toggle-duration-layout',
  'set-inline-layout',
  'set-stacked-layout',
  'insert-after',
  'toggle-finish',
  'set-countdown',
  'toggle-archive',
  'meta',
  'color',
  'show-archived',
  'hide-archived',
  'delete',
] as const

export type ContextMenuItemId = (typeof DEFAULT_CONTEXT_MENU_ORDER)[number]
export type ContextMenuShiftDirection = -1 | 1

const CONTEXT_MENU_ID_SET = new Set<string>(DEFAULT_CONTEXT_MENU_ORDER)

export function normalizeContextMenuOrder(value: unknown): ContextMenuItemId[] {
  const seen = new Set<string>()
  const normalized: ContextMenuItemId[] = []

  if (Array.isArray(value)) {
    value.forEach((entry) => {
      if (typeof entry !== 'string' || !CONTEXT_MENU_ID_SET.has(entry) || seen.has(entry)) {
        return
      }
      seen.add(entry)
      normalized.push(entry as ContextMenuItemId)
    })
  }

  DEFAULT_CONTEXT_MENU_ORDER.forEach((entry) => {
    if (seen.has(entry)) {
      return
    }
    seen.add(entry)
    normalized.push(entry)
  })

  return normalized
}

type ReorderContextMenuOrderInput = {
  order: unknown
  activeId: string
  overId: string
}

export function reorderContextMenuOrder({
  order,
  activeId,
  overId,
}: ReorderContextMenuOrderInput): ContextMenuItemId[] {
  const normalized = normalizeContextMenuOrder(order)
  const from = normalized.indexOf(activeId as ContextMenuItemId)
  const to = normalized.indexOf(overId as ContextMenuItemId)

  if (from < 0 || to < 0 || from === to) {
    return normalized
  }

  const next = [...normalized]
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved)
  return next
}

type ShiftContextMenuOrderItemInput = {
  order: unknown
  itemId: string
  direction: ContextMenuShiftDirection
}

export function shiftContextMenuOrderItem({
  order,
  itemId,
  direction,
}: ShiftContextMenuOrderItemInput): ContextMenuItemId[] {
  const normalized = normalizeContextMenuOrder(order)
  const from = normalized.indexOf(itemId as ContextMenuItemId)

  if (from < 0) {
    return normalized
  }

  const to = from + direction
  if (to < 0 || to >= normalized.length) {
    return normalized
  }

  return reorderContextMenuOrder({
    order: normalized,
    activeId: itemId,
    overId: normalized[to],
  })
}
