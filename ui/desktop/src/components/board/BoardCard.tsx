import React from 'react';
import { Calendar, Folder, MessageSquareText, Check, RotateCcw } from 'lucide-react';
import { Card } from '../ui/card';
import { SessionIndicators } from '../SessionIndicators';
import type { SessionListItem } from '../../acp/sessions';
import type { BoardColumn } from './boardClassification';

interface BoardCardProps {
  session: SessionListItem;
  column: BoardColumn;
  isStreaming: boolean;
  hasUnread: boolean;
  hasError: boolean;
  onOpen: (id: string) => void;
  onToggleDone: (id: string, done: boolean) => void;
}

export const BoardCard = React.memo<BoardCardProps>(
  ({ session, column, isStreaming, hasUnread, hasError, onOpen, onToggleDone }) => {
    const lastActivity = session.lastMessageAt ?? session.updatedAt;
    return (
      <Card
        data-testid="board-card"
        draggable={column !== 'working'}
        onDragStart={(e) => e.dataTransfer.setData('text/plain', session.id)}
        onClick={() => onOpen(session.id)}
        className="py-3 px-4 mb-2 hover:shadow-default cursor-pointer transition-all duration-150 relative group"
      >
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-sm break-words line-clamp-2 flex-1">{session.name || session.id}</h3>
          <SessionIndicators isStreaming={isStreaming} hasUnread={hasUnread} hasError={hasError} />
        </div>
        <div className="flex items-center text-text-secondary text-xs mt-2">
          <Calendar className="w-3 h-3 mr-1 flex-shrink-0" />
          <span>{new Date(lastActivity).toLocaleString()}</span>
        </div>
        <div className="flex items-center text-text-secondary text-xs">
          <Folder className="w-3 h-3 mr-1 flex-shrink-0" />
          <span className="truncate">{session.workingDir}</span>
        </div>
        <div className="flex items-center justify-between mt-2">
          <div className="flex items-center text-xs text-text-secondary">
            <MessageSquareText className="w-3 h-3 mr-1" />
            <span className="font-mono">{session.messageCount}</span>
          </div>
          <button
            className="opacity-0 group-hover:opacity-100 text-xs flex items-center gap-1 text-text-secondary hover:text-text-primary"
            onClick={(e) => {
              e.stopPropagation();
              onToggleDone(session.id, column !== 'done');
            }}
          >
            {column === 'done' ? (
              <>
                <RotateCcw className="w-3 h-3" /> Wieder öffnen
              </>
            ) : (
              <>
                <Check className="w-3 h-3" /> Done
              </>
            )}
          </button>
        </div>
      </Card>
    );
  }
);
BoardCard.displayName = 'BoardCard';
