import { describe, expect, it } from 'vitest';
import {
  firstLine,
  formatDuration,
  prettyTimeAgo,
  shortHost,
} from '../../../files/app/admin/utils/format';

describe('shortHost', () => {
  it("returns '—' for undefined/empty", () => {
    expect(shortHost(undefined)).toBe('—');
    expect(shortHost('')).toBe('—');
  });

  it('strips protocol and keeps the leftmost subdomain', () => {
    expect(shortHost('https://foo.bar.example.com')).toBe('foo');
    expect(shortHost('http://my-app.vercel.app')).toBe('my-app');
  });

  it('handles bare hostnames', () => {
    expect(shortHost('foo.example.com')).toBe('foo');
  });
});

describe('prettyTimeAgo', () => {
  const now = 1_700_000_000_000;

  it("returns '—' when now is null (SSR)", () => {
    expect(prettyTimeAgo(now - 60_000, null)).toBe('—');
  });

  it("returns 'just now' under 1 minute", () => {
    expect(prettyTimeAgo(now - 30_000, now)).toBe('just now');
    expect(prettyTimeAgo(now, now)).toBe('just now');
  });

  it('returns minutes between 1m and 1h', () => {
    expect(prettyTimeAgo(now - 5 * 60_000, now)).toBe('5m ago');
    expect(prettyTimeAgo(now - 59 * 60_000, now)).toBe('59m ago');
  });

  it('returns hours between 1h and 1d', () => {
    expect(prettyTimeAgo(now - 60 * 60_000, now)).toBe('1h ago');
    expect(prettyTimeAgo(now - 23 * 60 * 60_000, now)).toBe('23h ago');
  });

  it('returns days beyond 24h', () => {
    expect(prettyTimeAgo(now - 24 * 60 * 60_000, now)).toBe('1d ago');
    expect(prettyTimeAgo(now - 7 * 24 * 60 * 60_000, now)).toBe('7d ago');
  });
});

describe('formatDuration', () => {
  it("returns '0s' for negative durations", () => {
    expect(formatDuration(-1)).toBe('0s');
    expect(formatDuration(-60_000)).toBe('0s');
  });

  it('returns seconds under a minute', () => {
    expect(formatDuration(0)).toBe('0s');
    expect(formatDuration(45_000)).toBe('45s');
  });

  it('pads seconds within minutes', () => {
    expect(formatDuration(65_000)).toBe('1m 05s');
    expect(formatDuration(60_000)).toBe('1m 00s');
  });

  it('pads minutes within hours', () => {
    expect(formatDuration(3_660_000)).toBe('1h 01m');
    expect(formatDuration(2 * 3_600_000)).toBe('2h 00m');
  });
});

describe('firstLine', () => {
  it("returns '' for null/undefined/empty", () => {
    expect(firstLine(null)).toBe('');
    expect(firstLine(undefined)).toBe('');
    expect(firstLine('')).toBe('');
  });

  it('returns the input when single-line', () => {
    expect(firstLine('hello')).toBe('hello');
  });

  it('returns only the first line for multi-line strings', () => {
    expect(firstLine('title\nbody\nmore')).toBe('title');
  });
});
