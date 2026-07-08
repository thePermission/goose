import { describe, it, expect } from 'vitest';
import { classifySession, DONE_TTL_MS } from './boardClassification';

const NOW = 1_000_000_000_000;

describe('classifySession', () => {
  it('streaming session (not done) => working', () => {
    expect(classifySession({ done: false, lastActivityMs: NOW, streamState: 'streaming' }, NOW)).toBe('working');
  });

  it('non-done, idle => waiting', () => {
    expect(classifySession({ done: false, lastActivityMs: NOW, streamState: 'idle' }, NOW)).toBe('waiting');
  });

  it('non-done, no status => waiting', () => {
    expect(classifySession({ done: false, lastActivityMs: NOW }, NOW)).toBe('waiting');
  });

  it('error session (not done) => waiting', () => {
    expect(classifySession({ done: false, lastActivityMs: NOW, streamState: 'error' }, NOW)).toBe('waiting');
  });

  it('done within 48h => done', () => {
    expect(classifySession({ done: true, lastActivityMs: NOW - DONE_TTL_MS + 1000 }, NOW)).toBe('done');
  });

  it('done older than 48h => hidden (null)', () => {
    expect(classifySession({ done: true, lastActivityMs: NOW - DONE_TTL_MS - 1000 }, NOW)).toBeNull();
  });

  it('done wins over streaming', () => {
    expect(classifySession({ done: true, lastActivityMs: NOW, streamState: 'streaming' }, NOW)).toBe('done');
  });
});
