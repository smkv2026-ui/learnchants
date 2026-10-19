const ALLOWED_TAGS = new Set(['P', 'BR', 'STRONG', 'B', 'EM', 'I', 'U', 'UL', 'OL', 'LI', 'BLOCKQUOTE', 'H3', 'H4', 'SPAN', 'DIV']);
const ALLOWED_ATTRS = new Set(['lang', 'dir']);

/**
 * Allow-list sanitiser for verse details / meaning (simple rich text).
 * Unknown elements are unwrapped (their text kept); scripts/styles dropped.
 */
export function sanitizeHtml(html: string): string {
  if (!html) return '';
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
  const root = doc.body.firstElementChild as HTMLElement;
  const walk = (node: Element) => {
    for (const child of Array.from(node.children)) {
      if (['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'TEMPLATE', 'SVG', 'MATH'].includes(child.tagName)) {
        child.remove();
        continue;
      }
      walk(child);
      if (!ALLOWED_TAGS.has(child.tagName)) {
        child.replaceWith(...Array.from(child.childNodes));
        continue;
      }
      for (const attr of Array.from(child.attributes)) {
        if (!ALLOWED_ATTRS.has(attr.name.toLowerCase())) child.removeAttribute(attr.name);
      }
    }
  };
  walk(root);
  return root.innerHTML;
}

export function htmlToText(html: string): string {
  if (!html) return '';
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return (doc.body.textContent || '').replace(/\s+/g, ' ').trim();
}

/** Heuristic: does the text contain Devanagari (or other Indic) script? */
export function hasIndic(text: string): boolean {
  return /[ऀ-෿]/.test(text);
}
