import { describe, expect, it } from 'vitest';
import {
  nextCronFireMs,
  parisHour,
  phaseLabel,
} from '../../../files/app/admin/utils/time';

describe('nextCronFireMs', () => {
  it('rounds up to the next :00 / :15 / :30 / :45 UTC', () => {
    const next = nextCronFireMs(Date.UTC(2026, 4, 21, 10, 7, 30, 0));
    expect(next).toBe(Date.UTC(2026, 4, 21, 10, 15, 0, 0));
  });

  it('jumps to the next slot when sitting exactly on a tick', () => {
    const next = nextCronFireMs(Date.UTC(2026, 4, 21, 10, 0, 0, 0));
    expect(next).toBe(Date.UTC(2026, 4, 21, 10, 15, 0, 0));
  });

  it('crosses the hour boundary', () => {
    const next = nextCronFireMs(Date.UTC(2026, 4, 21, 10, 47, 0, 0));
    expect(next).toBe(Date.UTC(2026, 4, 21, 11, 0, 0, 0));
  });
});

describe('parisHour', () => {
  it('returns the hour in Europe/Paris regardless of the input timezone', () => {
    // 09:00 UTC = 10:00 Paris in winter (CET, UTC+1)
    expect(parisHour(Date.UTC(2026, 0, 15, 9, 0, 0, 0))).toBe(10);
    // 09:00 UTC = 11:00 Paris in summer (CEST, UTC+2)
    expect(parisHour(Date.UTC(2026, 6, 15, 9, 0, 0, 0))).toBe(11);
  });
});

describe('phaseLabel', () => {
  it('uses the morning label before 12h Paris', () => {
    expect(phaseLabel(0)).toMatch(/Matin/);
    expect(phaseLabel(11)).toMatch(/Matin/);
  });

  it('uses the afternoon label at or after 12h Paris', () => {
    expect(phaseLabel(12)).toMatch(/Après-midi/);
    expect(phaseLabel(23)).toMatch(/Après-midi/);
  });
});
