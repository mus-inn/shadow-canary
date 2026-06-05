import type { Deployment } from '@/lib/admin-vercel';
import type { ShadowHistoryEntry } from './dashboard';

export type ModalState =
  | { kind: 'closed' }
  | { kind: 'cancel' }
  | { kind: 'promote' }
  | { kind: 'rollback'; deploy: Deployment }
  | { kind: 'rollback-shadow'; target: ShadowHistoryEntry };

export const CLOSED_MODAL: ModalState = { kind: 'closed' };

export const isRollback = (
  m: ModalState,
): m is Extract<ModalState, { kind: 'rollback' }> => m.kind === 'rollback';

export const isRollbackShadow = (
  m: ModalState,
): m is Extract<ModalState, { kind: 'rollback-shadow' }> =>
  m.kind === 'rollback-shadow';
