import { describe, expect, it } from 'vitest';
import {
  actionRunnerReducer,
  type ActionRunnerState,
} from '../../../files/app/admin/hooks/use-action-runner';

const initial: ActionRunnerState = { pendingAction: null, actionError: null };

describe('actionRunnerReducer', () => {
  it('action/start sets the pending id and clears any prior error', () => {
    const next = actionRunnerReducer(
      { pendingAction: null, actionError: 'boom' },
      { type: 'action/start', id: 'pause' },
    );
    expect(next).toEqual({ pendingAction: 'pause', actionError: null });
  });

  it('action/success clears the pending id and the error slot', () => {
    const next = actionRunnerReducer(
      { pendingAction: 'pause', actionError: null },
      { type: 'action/success' },
    );
    expect(next).toEqual({ pendingAction: null, actionError: null });
  });

  it('action/error captures the message and clears the pending id', () => {
    const next = actionRunnerReducer(
      { pendingAction: 'cancel', actionError: null },
      { type: 'action/error', error: 'conflict' },
    );
    expect(next).toEqual({ pendingAction: null, actionError: 'conflict' });
  });

  it('action/start overrides a previous error', () => {
    const next = actionRunnerReducer(
      { pendingAction: null, actionError: 'previous boom' },
      { type: 'action/start', id: 'resume' },
    );
    expect(next.actionError).toBeNull();
    expect(next.pendingAction).toBe('resume');
  });

  it('does not mutate the input state', () => {
    Object.freeze(initial);
    expect(() =>
      actionRunnerReducer(initial, { type: 'action/start', id: 'pause' }),
    ).not.toThrow();
  });
});
