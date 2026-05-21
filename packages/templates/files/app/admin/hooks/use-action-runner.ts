'use client';

import { useCallback, useReducer, useRef } from 'react';

export type ActionRunnerState = {
  pendingAction: string | null;
  actionError: string | null;
};

export type ActionRunnerAction =
  | { type: 'action/start'; id: string }
  | { type: 'action/success' }
  | { type: 'action/error'; error: string };

export function actionRunnerReducer(
  state: ActionRunnerState,
  action: ActionRunnerAction,
): ActionRunnerState {
  switch (action.type) {
    case 'action/start':
      return { pendingAction: action.id, actionError: null };
    case 'action/success':
      return { pendingAction: null, actionError: null };
    case 'action/error':
      return { pendingAction: null, actionError: action.error };
  }
}

// Coordinates user-triggered POST actions: tracks which one is in flight,
// surfaces the last error, and calls `onSuccess` after a successful run
// (typically: refresh data + close modal). `onSuccess` is captured by ref
// so a non-memoized callback from the caller does not invalidate `run`.
export function useActionRunner(opts: {
  onSuccess?: () => void | Promise<void>;
} = {}): ActionRunnerState & {
  run: (id: string, fn: () => Promise<void>) => Promise<void>;
} {
  const [state, dispatch] = useReducer(actionRunnerReducer, {
    pendingAction: null,
    actionError: null,
  });
  const onSuccessRef = useRef(opts.onSuccess);
  onSuccessRef.current = opts.onSuccess;

  const run = useCallback(
    async (id: string, fn: () => Promise<void>) => {
      if (state.pendingAction) return;
      dispatch({ type: 'action/start', id });
      try {
        await fn();
        const after = onSuccessRef.current;
        if (after) await after();
        dispatch({ type: 'action/success' });
      } catch (e) {
        dispatch({
          type: 'action/error',
          error: e instanceof Error ? e.message : 'action failed',
        });
      }
    },
    [state.pendingAction],
  );

  return { ...state, run };
}
