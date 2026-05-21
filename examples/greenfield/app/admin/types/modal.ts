import type { Deployment } from '@/lib/admin-vercel';
import type { ShadowHistoryEntry } from './dashboard';

// Step 9 will replace the leading `null` with `{ kind: 'closed' }` for an
// exhaustive discriminated union; for now we mirror the existing shape so
// every extraction step stays a no-op behavior-wise.
export type ModalState =
  | null
  | { kind: 'cancel' }
  | { kind: 'promote' }
  | { kind: 'rollback'; deploy: Deployment }
  | { kind: 'rollback-shadow'; target: ShadowHistoryEntry };
