import React from 'react';
import type { BoardColumn as BoardColumnId } from './boardClassification';

interface BoardColumnProps {
  id: BoardColumnId;
  title: string;
  count: number;
  isDropTarget: boolean;
  onDropSession?: (sessionId: string) => void;
  children: React.ReactNode;
}

export function BoardColumn({ id, title, count, isDropTarget, onDropSession, children }: BoardColumnProps) {
  const [over, setOver] = React.useState(false);
  return (
    <div
      data-testid={`board-column-${id}`}
      className={`flex-1 min-w-[240px] flex flex-col rounded-lg bg-background-secondary p-2 ${
        over ? 'ring-2 ring-ring' : ''
      }`}
      onDragOver={isDropTarget ? (e) => { e.preventDefault(); setOver(true); } : undefined}
      onDragLeave={isDropTarget ? () => setOver(false) : undefined}
      onDrop={
        isDropTarget
          ? (e) => {
              e.preventDefault();
              setOver(false);
              const id = e.dataTransfer.getData('text/plain');
              if (id) onDropSession?.(id);
            }
          : undefined
      }
    >
      <div className="flex items-center justify-between px-1 py-2 text-sm font-medium">
        <span>{title}</span>
        <span className="text-text-secondary font-mono">{count}</span>
      </div>
      <div className="flex-1 overflow-y-auto">
        {count === 0 ? <div className="text-xs text-text-secondary px-1 py-4">Keine Sessions</div> : children}
      </div>
    </div>
  );
}
