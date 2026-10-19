import { describe, expect, it } from 'vitest';
import { hasIndic, htmlToText, sanitizeHtml } from './sanitize';

describe('sanitizeHtml', () => {
  it('keeps allowed formatting and lang attributes', () => {
    expect(sanitizeHtml('<p lang="sa">नमस्ते <b>रुद्र</b></p>')).toBe('<p lang="sa">नमस्ते <b>रुद्र</b></p>');
  });
  it('removes scripts, handlers and unknown tags', () => {
    const out = sanitizeHtml('<p onclick="x()">hi<script>alert(1)</script><img src=x onerror=alert(1)><a href="javascript:1">link</a></p>');
    expect(out).toBe('<p>hilink</p>');
  });
  it('extracts text and detects Indic script', () => {
    expect(htmlToText('<p>a</p><p>  b </p>')).toBe('a b');
    expect(hasIndic('ॐ नमः')).toBe(true);
    expect(hasIndic('Om')).toBe(false);
  });
});
