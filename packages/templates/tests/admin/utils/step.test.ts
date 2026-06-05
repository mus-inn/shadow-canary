import { describe, expect, it } from 'vitest';
import { stepSize } from '../../../files/app/admin/utils/step';

describe('stepSize', () => {
  it('returns the rounded integer for valid drafts', () => {
    expect(stepSize('1')).toBe(1);
    expect(stepSize('4')).toBe(4);
    expect(stepSize('50')).toBe(50);
    expect(stepSize('3.7')).toBe(4);
  });

  it('returns null for out-of-range values', () => {
    expect(stepSize('0')).toBeNull();
    expect(stepSize('51')).toBeNull();
    expect(stepSize('-1')).toBeNull();
  });

  it('returns null for non-numeric input', () => {
    expect(stepSize('')).toBeNull();
    expect(stepSize('abc')).toBeNull();
    expect(stepSize('NaN')).toBeNull();
  });
});
