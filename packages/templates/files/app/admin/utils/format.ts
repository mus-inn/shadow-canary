export function shortHost(url?: string): string {
  if (!url) return '—';
  const head = url.replace(/^https?:\/\//, '').split('.')[0];
  return head ?? '—';
}

export function prettyTimeAgo(ms: number, now: number | null): string {
  if (now === null) return '—';
  const diff = now - ms;
  const m = Math.floor(diff / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function formatDuration(ms: number): string {
  if (ms < 0) return '0s';
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${(s % 60).toString().padStart(2, '0')}s`;
  return `${Math.floor(m / 60)}h ${(m % 60).toString().padStart(2, '0')}m`;
}

// First non-empty line of a multi-line string, trimmed; '' when input is empty
// or only whitespace. Safe under noUncheckedIndexedAccess.
export function firstLine(text: string | null | undefined): string {
  if (!text) return '';
  return text.split('\n')[0] ?? '';
}
