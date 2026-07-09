import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { IntlTestWrapper } from '../../i18n/test-utils';
import { AppEvents } from '../../constants/events';
import { SessionStatusProvider } from '../../contexts/SessionStatusContext';
import BoardView from './BoardView';

const { mockSession, acpListSessions } = vi.hoisted(() => {
  const now = new Date().toISOString();
  return {
    mockSession: {
      id: 'sess-1',
      name: 'Test session',
      workingDir: '/tmp/project',
      updatedAt: now,
      messageCount: 3,
      lastMessageAt: now,
      createdAt: now,
      done: false,
    },
    acpListSessions: vi.fn(),
  };
});

vi.mock('../../acp/sessions', () => ({
  acpListSessions,
  acpSetSessionDone: vi.fn().mockResolvedValue(undefined),
}));

function emitStatus(sessionId: string, streamState: string) {
  act(() => {
    window.dispatchEvent(
      new CustomEvent(AppEvents.SESSION_STATUS_UPDATE, {
        detail: { sessionId, streamState },
      })
    );
  });
}

function Harness({ showBoard }: { showBoard: boolean }) {
  return (
    <IntlTestWrapper>
      <SessionStatusProvider>
        <MemoryRouter>{showBoard ? <BoardView /> : <div data-testid="placeholder" />}</MemoryRouter>
      </SessionStatusProvider>
    </IntlTestWrapper>
  );
}

describe('BoardView live status', () => {
  beforeEach(() => {
    acpListSessions.mockResolvedValue({ sessions: [mockSession], nextCursor: null });
  });

  // The regression: a session that was ALREADY streaming before the user
  // navigated to the board must still land in "Working". Previously the board
  // kept its own status map that reset to empty on every mount, so it missed
  // the streaming event fired before it mounted and showed the session as Waiting.
  it('shows an already-streaming session in Working even when the board mounts AFTER the status event', async () => {
    const { rerender } = render(<Harness showBoard={false} />);

    // streaming starts while the board is NOT mounted (persistent provider catches it)
    emitStatus('sess-1', 'streaming');

    // user now navigates to the board (late mount)
    rerender(<Harness showBoard />);

    const working = await screen.findByTestId('board-column-working');
    await waitFor(() => {
      expect(within(working).getByTestId('board-card')).toHaveAttribute(
        'data-session-id',
        'sess-1'
      );
    });
  });

  it('moves a session into Working live when it starts streaming while the board is open', async () => {
    render(<Harness showBoard />);

    // session initially idle -> waiting
    const waiting = await screen.findByTestId('board-column-waiting');
    await waitFor(() => {
      expect(within(waiting).getByTestId('board-card')).toHaveAttribute('data-session-id', 'sess-1');
    });

    // now it starts streaming -> must move to working without a manual refresh
    emitStatus('sess-1', 'streaming');

    const working = screen.getByTestId('board-column-working');
    await waitFor(() => {
      expect(within(working).getByTestId('board-card')).toHaveAttribute('data-session-id', 'sess-1');
    });
    expect(within(screen.getByTestId('board-column-waiting')).queryByTestId('board-card')).toBeNull();
  });
});
