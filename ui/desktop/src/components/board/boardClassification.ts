export type BoardColumn = 'waiting' | 'working' | 'done';

export const DONE_TTL_MS = 48 * 60 * 60 * 1000;

export interface BoardClassifyInput {
  done: boolean;
  lastActivityMs: number;
  streamState?: 'idle' | 'loading' | 'streaming' | 'error';
}

/**
 * Ordnet eine Session genau einer Board-Spalte zu.
 * Priorität: Working (streamt) > Done (nur ≤ 48h alt) > Waiting.
 * Eine erneut streamende Session gilt also als Working, auch wenn sie als done
 * markiert war (Reaktivierung — das done-Flag wird serverseitig beim Anhängen
 * der neuen Nachricht gelöscht).
 * Rückgabe `null` => nicht anzeigen (Done und letzte Aktivität > 48h her).
 */
export function classifySession(input: BoardClassifyInput, nowMs: number): BoardColumn | null {
  if (input.streamState === 'streaming') {
    return 'working';
  }
  if (input.done) {
    return nowMs - input.lastActivityMs <= DONE_TTL_MS ? 'done' : null;
  }
  return 'waiting';
}
