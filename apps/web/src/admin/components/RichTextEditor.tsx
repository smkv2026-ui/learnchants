import { useEffect, useRef } from 'react';
import { sanitizeHtml } from '@/lib/sanitize';
import { Icon, cn, type IconName } from '@/components/ui';

const TOOLS: { cmd: string; arg?: string; icon?: IconName; label: string; text?: string }[] = [
  { cmd: 'bold', label: 'Bold', text: 'B' },
  { cmd: 'italic', label: 'Italic', text: 'I' },
  { cmd: 'underline', label: 'Underline', text: 'U' },
  { cmd: 'insertUnorderedList', label: 'Bullet list', icon: 'list' },
  { cmd: 'formatBlock', arg: 'blockquote', label: 'Quote', text: '❝' },
  { cmd: 'formatBlock', arg: 'p', label: 'Paragraph', text: '¶' },
];

/**
 * Lightweight rich text editor for verse meaning/details. Indic-script friendly:
 * the "Sanskrit" button marks the current paragraph lang="sa" so it renders in a
 * Devanagari display font. Output is sanitised on every change.
 */
export function RichTextEditor({ value, onChange, label, placeholder }: { value: string; onChange: (html: string) => void; label: string; placeholder?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (ref.current && ref.current.innerHTML !== value && document.activeElement !== ref.current) {
      ref.current.innerHTML = value || '';
    }
  }, [value]);

  const emit = () => ref.current && onChange(sanitizeHtml(ref.current.innerHTML));

  const exec = (cmd: string, arg?: string) => {
    ref.current?.focus();
    document.execCommand(cmd, false, arg);
    emit();
  };

  const markSanskrit = () => {
    const sel = window.getSelection();
    let node = sel?.anchorNode as HTMLElement | null;
    while (node && node !== ref.current && !(node instanceof HTMLElement && /^(P|DIV|BLOCKQUOTE|LI)$/.test(node.tagName))) {
      node = node.parentNode as HTMLElement | null;
    }
    if (node && node !== ref.current) {
      if (node.getAttribute('lang') === 'sa') node.removeAttribute('lang');
      else node.setAttribute('lang', 'sa');
      emit();
    } else {
      exec('formatBlock', 'p');
    }
  };

  return (
    <div>
      <span className="label" id="rte-label">{label}</span>
      <div className="overflow-hidden rounded-xl border hairline bg-surface/60 focus-within:border-primary/70">
        <div role="toolbar" aria-label="Formatting" className="flex flex-wrap gap-1 border-b hairline p-1.5">
          {TOOLS.map((t) => (
            <button
              key={t.label}
              type="button"
              title={t.label}
              aria-label={t.label}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => exec(t.cmd, t.arg)}
              className={cn('grid h-9 min-w-9 place-items-center rounded-lg px-2 text-sm font-semibold text-muted hover:bg-ink/10 hover:text-ink', t.text === 'I' && 'italic', t.text === 'U' && 'underline')}
            >
              {t.icon ? <Icon name={t.icon} size={16} /> : t.text}
            </button>
          ))}
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={markSanskrit}
            className="ml-auto rounded-lg px-2.5 text-sm text-muted hover:bg-ink/10 hover:text-ink"
            title="Mark paragraph as Sanskrit (Devanagari font)"
          >
            <span lang="sa" className="font-chant">अ</span> Sanskrit
          </button>
        </div>
        <div
          ref={ref}
          role="textbox"
          aria-multiline="true"
          aria-labelledby="rte-label"
          contentEditable
          suppressContentEditableWarning
          data-placeholder={placeholder}
          onInput={emit}
          onBlur={emit}
          className="rich-text min-h-[160px] px-4 py-3 outline-none empty:before:text-muted/60 empty:before:content-[attr(data-placeholder)]"
        />
      </div>
    </div>
  );
}
