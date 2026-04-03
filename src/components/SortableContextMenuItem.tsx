import type { CSSProperties, ReactNode } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

type SortableContextMenuItemProps = {
  id: string
  label: string
  children: ReactNode
}

export function SortableContextMenuItem({ id, label, children }: SortableContextMenuItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  } as CSSProperties

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`context-menu-sortable-item${isDragging ? ' is-dragging' : ''}`}
    >
      <button
        type="button"
        className="context-menu-drag-handle"
        aria-label={`拖动排序 ${label}`}
        title={`拖动排序 ${label}`}
        {...attributes}
        {...listeners}
      >
        ⋮⋮
      </button>

      <div className="context-menu-item-body">
        {children}
      </div>
    </div>
  )
}
