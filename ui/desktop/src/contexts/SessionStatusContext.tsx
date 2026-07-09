import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AppEvents } from '../constants/events';

export type StreamState = 'idle' | 'loading' | 'streaming' | 'error';

export interface SessionStatus {
  streamState: StreamState;
  hasUnreadActivity: boolean;
}

interface SessionStatusContextValue {
  statuses: Map<string, SessionStatus>;
  clearUnread: (sessionId: string) => void;
}

const SessionStatusContext = createContext<SessionStatusContextValue | null>(null);

/**
 * App-wide, persistent store of per-session live stream status, derived from
 * SESSION_STATUS_UPDATE window events (emitted by BaseChat as chatState changes).
 *
 * Must be mounted high enough to stay alive across route changes. Consumers that
 * mount late (e.g. the board, reached by navigation) then still see status that
 * was emitted before they mounted — the provider, not the consumer, owns the
 * subscription. This is the single source of truth shared by the sidebar and
 * the board so their "working"/unread indicators can never diverge.
 */
export function SessionStatusProvider({ children }: { children: React.ReactNode }) {
  const [statuses, setStatuses] = useState<Map<string, SessionStatus>>(new Map());

  useEffect(() => {
    const onStatus = (event: Event) => {
      const { sessionId, streamState } = (event as CustomEvent).detail as {
        sessionId: string;
        streamState: StreamState;
      };
      setStatuses((prev) => {
        const existing = prev.get(sessionId);
        const shouldMarkUnread = existing?.streamState === 'streaming' && streamState === 'idle';
        const next = new Map(prev);
        next.set(sessionId, {
          streamState,
          hasUnreadActivity: existing?.hasUnreadActivity || shouldMarkUnread,
        });
        return next;
      });
    };
    window.addEventListener(AppEvents.SESSION_STATUS_UPDATE, onStatus);
    return () => window.removeEventListener(AppEvents.SESSION_STATUS_UPDATE, onStatus);
  }, []);

  const clearUnread = useCallback((sessionId: string) => {
    setStatuses((prev) => {
      const status = prev.get(sessionId);
      if (!status?.hasUnreadActivity) return prev;
      const next = new Map(prev);
      next.set(sessionId, { ...status, hasUnreadActivity: false });
      return next;
    });
  }, []);

  const value = useMemo<SessionStatusContextValue>(
    () => ({ statuses, clearUnread }),
    [statuses, clearUnread]
  );

  return <SessionStatusContext.Provider value={value}>{children}</SessionStatusContext.Provider>;
}

export function useSessionStatuses(): SessionStatusContextValue {
  const ctx = useContext(SessionStatusContext);
  if (!ctx) {
    throw new Error('useSessionStatuses must be used within a SessionStatusProvider');
  }
  return ctx;
}
