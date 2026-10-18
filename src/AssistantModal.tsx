import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export default function AssistantModal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const heading = useId(), box = useRef<HTMLElement>(null), close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const previous = document.activeElement, overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden'; box.current?.focus();
    const keys = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close.current(); return; }
      if (event.key !== 'Tab' || !box.current) return;
      const items = Array.from(box.current.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]):not([hidden]),textarea:not([disabled]),select:not([disabled]),summary,[tabindex="0"]'));
      const first = items[0], last = items[items.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === box.current)) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === box.current)) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', keys, true);
    return () => { document.removeEventListener('keydown', keys, true); document.body.style.overflow = overflow; if (previous instanceof HTMLElement && previous.isConnected) previous.focus(); };
  }, []);
  return createPortal(<div className="dialog-backdrop" style={{ zIndex: 110, padding: 12 }}>
    <section className="dialog-card" ref={box} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={heading}
      style={{ width: 'min(100%, 640px)', maxHeight: 'calc(100dvh - 24px)', padding: 20, overflow: 'hidden', overflowWrap: 'anywhere' }}>
      <h2 id={heading}>{title}</h2>
      <div style={{ minHeight: 0, overflowY: 'auto', display: 'grid', gap: 16, paddingRight: 4 }}>{children}</div>
      <button type="button" className="secondary-button" style={{ flexShrink: 0 }} onClick={onClose}>关闭{title}</button>
    </section>
  </div>, document.body);
}
