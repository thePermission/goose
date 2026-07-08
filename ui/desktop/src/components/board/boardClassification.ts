export type BoardColumn = 'waiting' | 'working' | 'done';

export const DONE_TTL_MS = 48 * 60 * 60 * 1000;

export interface BoardClassifyInput {
  done: boolean;
  lastActivityMs: number;
  streamState?: 'idle' | 'loading' | 'streaming' | 'error';
}

/**
 * Ordnet eine Session genau einer Board-Spalte zu.
 * Priorität: Done (nur ≤ 48h alt) > Working (streamt) > Waiting.
 * Rückgabe `null` => nicht anzeigen (Done und letzte Aktivität > 48h her).
 */
export function classifySession(input: BoardClassifyInput, nowMs: number): BoardColumn | null {
  if (input.done) {
    return nowMs - input.lastActivityMs <= DONE_TTL_MS ? 'done' : null;
  }
  if (input.streamState === 'streaming') {
    return 'working';
  }
  return 'waiting';
}
