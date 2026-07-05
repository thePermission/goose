import { describe, it, expect, vi } from 'vitest';
import { createNavigationHandler } from './navigationUtils';

describe('createNavigationHandler', () => {
  it('navigates to /marketplaces for the marketplaces view', () => {
    const navigate = vi.fn();
    createNavigationHandler(navigate)('marketplaces');
    expect(navigate).toHaveBeenCalledWith('/marketplaces', { state: undefined });
  });
});
