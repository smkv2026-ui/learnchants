import { describe, expect, it } from 'vitest';
import { buildUpiLink, formatInr, isValidUpiId } from './upi';

describe('UPI', () => {
  it('builds a upi:// deep link with encoded params', () => {
    expect(buildUpiLink({ upiId: 'trust@okhdfc', payeeName: 'Learn Chants Trust', amount: 199, note: 'Sri Rudram & more' })).toBe(
      'upi://pay?pa=trust%40okhdfc&pn=Learn%20Chants%20Trust&am=199.00&cu=INR&tn=Sri%20Rudram%20%26%20more',
    );
  });
  it('validates UPI ids', () => {
    expect(isValidUpiId('name.surname@okicici')).toBe(true);
    expect(isValidUpiId('no-at-sign')).toBe(false);
    expect(isValidUpiId('a@1bank')).toBe(false);
  });
  it('formats rupees', () => {
    expect(formatInr(1999)).toMatch(/1,999/);
  });
});
