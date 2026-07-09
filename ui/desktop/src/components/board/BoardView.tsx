import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { acpListSessions, acpSetSessionDone, type SessionListItem } from '../../acp/sessions';
import { AppEvents } from '../../constants/events';
import { defineMessages, useIntl } from '../../i18n';
import { classifySession, type BoardColumn as BoardColumnId } from './boardClassification';
import { BoardColumn } from './BoardColumn';
import { BoardCard } from './BoardCard';
import { useSessionStatuses } from '../../contexts/SessionStatusContext';

const i18n = defineMessages({
  title: { id: 'board.title', defaultMessage: 'Board' },
  columnWaiting: { id: 'board.columnWaiting', defaultMessage: 'Waiting' },
  columnWorking: { id: 'board.columnWorking', defaultMessage: 'Working' },
  columnDone: { id: 'board.columnDone', defaultMessage: 'Done' },
});

const COLUMN_ORDER: BoardColumnId[] = ['waiting', 'working', 'done'];

async function loadAllSessions(cap = 300): Promise<SessionListItem[]> {
  const all: SessionListItem[] = [];
  let cursor: string | null = null;
  do {
    const page = await acpListSessions(cursor);
    all.push(...page.sessions);
    cursor = page.nextCursor;
  } while (cursor && all.length < cap);
  return all;
}

export default function BoardView() {
  const navigate = useNavigate();
  const intl = useIntl();
  const columnTitles: Record<BoardColumnId, string> = useMemo(
    () => ({
      waiting: intl.formatMessage(i18n.columnWaiting),
      working: intl.formatMessage(i18n.columnWorking),
      done: intl.formatMessage(i18n.columnDone),
    }),
    [intl]
  );
  const [sessions, setSessions] = useState<SessionListItem[]>([]);
  const { statuses } = useSessionStatuses();
  const [nowMs, setNowMs] = useState(() => Date.now());

  const refresh = useCallback(() => {
    loadAllSessions().then(setSessions).catch((e) => console.error('board load failed', e));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Refresh list on create/delete/rename/done
  useEffect(() => {
    const events = [
      AppEvents.SESSION_CREATED,
      AppEvents.SESSION_DELETED,
      AppEvents.SESSION_RENAMED,
      AppEvents.SESSION_DONE_UPDATE,
    ];
    events.forEach((e) => window.addEventListener(e, refresh));
    return () => events.forEach((e) => window.removeEventListener(e, refresh));
  }, [refresh]);

  // Re-evaluate 48h boundary periodically
  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  const onOpen = useCallback(
    (id: string) => navigate(`/pair?resumeSessionId=${id}`),
    [navigate]
  );

  const onToggleDone = useCallback((id: string, done: boolean) => {
    // optimistic
    setSessions((prev) => prev.map((s) => (s.id === id ? { ...s, done } : s)));
    acpSetSessionDone(id, done)
      .then(() => window.dispatchEvent(new CustomEvent(AppEvents.SESSION_DONE_UPDATE, { detail: { sessionId: id, done } })))
      .catch((e) => {
        console.error('set done failed', e);
        setSessions((prev) => prev.map((s) => (s.id === id ? { ...s, done: !done } : s)));
      });
  }, []);

  const columns = useMemo(() => {
    const grouped: Record<BoardColumnId, SessionListItem[]> = { waiting: [], working: [], done: [] };
    for (const s of sessions) {
      const status = statuses.get(s.id);
      const lastActivityMs = Date.parse(s.lastMessageAt ?? s.updatedAt);
      const col = classifySession(
        { done: s.done, lastActivityMs, streamState: status?.streamState },
        nowMs
      );
      if (col) grouped[col].push(s);
    }
    for (const col of COLUMN_ORDER) {
      grouped[col].sort(
        (a, b) =>
          Date.parse(b.lastMessageAt ?? b.updatedAt) - Date.parse(a.lastMessageAt ?? a.updatedAt)
      );
    }
    return grouped;
  }, [sessions, statuses, nowMs]);

  return (
    <div className="h-full flex flex-col p-4">
      <h1 className="text-lg font-medium mb-4">{intl.formatMessage(i18n.title)}</h1>
      <div className="flex-1 flex gap-3 overflow-x-auto">
        {COLUMN_ORDER.map((colId) => (
          <BoardColumn
            key={colId}
            id={colId}
            title={columnTitles[colId]}
            count={columns[colId].length}
            isDropTarget={colId !== 'working'}
            onDropSession={(id) => onToggleDone(id, colId === 'done')}
          >
            {columns[colId].map((s) => {
              const status = statuses.get(s.id);
              return (
                <BoardCard
                  key={s.id}
                  session={s}
                  column={colId}
                  isStreaming={status?.streamState === 'streaming'}
                  hasUnread={status?.hasUnreadActivity ?? false}
                  hasError={status?.streamState === 'error'}
                  onOpen={onOpen}
                  onToggleDone={onToggleDone}
                />
              );
            })}
          </BoardColumn>
        ))}
      </div>
    </div>
  );
}
