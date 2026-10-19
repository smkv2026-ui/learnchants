import type { ReactNode } from 'react';
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Icon } from '@/components/ui';

export interface HandleProps {
  attributes: ReturnType<typeof useSortable>['attributes'];
  listeners: ReturnType<typeof useSortable>['listeners'];
}

function Row<T extends { id: string }>({ item, render }: { item: T; render: (item: T, handle: ReactNode) => ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  const handle = (
    <button
      type="button"
      className="cursor-grab touch-none rounded-lg p-1.5 text-muted hover:bg-ink/10 hover:text-ink active:cursor-grabbing"
      aria-label="Drag to reorder (space to pick up, arrows to move)"
      {...attributes}
      {...listeners}
    >
      <Icon name="grip" size={18} />
    </button>
  );
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 10 : undefined }}
      className={isDragging ? 'relative opacity-90 shadow-glow' : 'relative'}
    >
      {render(item, handle)}
    </div>
  );
}

/** Drag-and-drop (mouse, touch and keyboard) sortable list. */
export function SortableList<T extends { id: string }>({
  items,
  onReorder,
  render,
  className,
}: {
  items: T[];
  onReorder: (fromId: string, toId: string) => void;
  render: (item: T, handle: ReactNode) => ReactNode;
  className?: string;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const onDragEnd = (e: DragEndEvent) => {
    if (e.over && e.active.id !== e.over.id) onReorder(String(e.active.id), String(e.over.id));
  };
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
        <div className={className}>
          {items.map((item) => (
            <Row key={item.id} item={item} render={render} />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
