'use client'

import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical } from 'lucide-react'
import { Input } from '@/components/ui/input'
import type { EventCategory } from '../types'

interface CategoriesTabProps {
  categories: EventCategory[]
  disabled: boolean
  onChange: (next: EventCategory[]) => void
}

function Row({ category, disabled, onTier }: { category: EventCategory; disabled: boolean; onTier: (tier: number) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: category.id, disabled })
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex items-center gap-3 rounded-md border border-border bg-card p-2.5 ${isDragging ? 'z-10 shadow-md' : ''}`}
    >
      <button
        type="button"
        className="cursor-grab touch-none rounded p-1 text-muted-foreground hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
        aria-label={`Reorder ${category.label}. Press space, then use the arrow keys.`}
        disabled={disabled}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <div className="min-w-0 flex-1">
        <p className="font-medium">{category.label}</p>
        <p className="truncate text-xs text-muted-foreground">{category.description}</p>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <span className="text-muted-foreground">Tier</span>
        <Input
          type="number"
          min={1}
          max={20}
          className="h-8 w-16"
          value={category.tier}
          disabled={disabled}
          onChange={(e) => onTier(Math.max(1, Number(e.target.value) || 1))}
        />
      </label>
    </li>
  )
}

export function CategoriesTab({ categories, disabled, onChange }: CategoriesTabProps) {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const from = categories.findIndex((c) => c.id === active.id)
    const to = categories.findIndex((c) => c.id === over.id)
    if (from < 0 || to < 0) return
    const tiers = categories.map((c) => c.tier).sort((a, b) => a - b)
    // The order sets who ranks first. The set of tier numbers stays the same.
    onChange(arrayMove(categories, from, to).map((c, i) => ({ ...c, tier: tiers[i] ?? c.tier })))
  }

  return (
    <div className="grid min-w-0 grid-cols-1 gap-3">
      <p className="text-sm text-muted-foreground">
        Tier 1 ranks first. Tiers only drive suggestions. An admin always makes the decision. Drag to reorder, or edit a
        tier directly.
      </p>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={categories.map((c) => c.id)} strategy={verticalListSortingStrategy}>
          <ul className="grid grid-cols-1 gap-2">
            {categories.map((category) => (
              <Row
                key={category.id}
                category={category}
                disabled={disabled}
                onTier={(tier) => onChange(categories.map((c) => (c.id === category.id ? { ...c, tier } : c)))}
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext>
    </div>
  )
}
