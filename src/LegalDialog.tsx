import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import PrivacyPolicy from './PrivacyPolicy';
import ServiceTerms from './ServiceTerms';

export type LegalKind = '服务条款' | '隐私政策';

export default function LegalDialog({ kind, onClose }: { kind: LegalKind; onClose: () => void }) {
  const titleId = useId();
  const dialog = useRef<HTMLElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.current?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close.current(); }
      if (event.key !== 'Tab' || !dialog.current) return;
      const items = Array.from(dialog.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), [tabindex="0"]'));
      const first = items[0], last = items[items.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog.current)) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', handleKey, true);
    return () => {
      document.removeEventListener('keydown', handleKey, true);
      document.body.style.overflow = previousOverflow;
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, []);
  return createPortal(<div className="dialog-backdrop" role="presentation" style={{ zIndex: 100, padding: 16 }} onMouseDown={onClose}>
    <section ref={dialog} aria-labelledby={titleId} aria-modal="true" className="dialog-card" role="dialog" tabIndex={-1}
      style={{ width: 'min(100%, 680px)', maxHeight: 'calc(100dvh - 32px)', overflow: 'hidden' }}
      onMouseDown={event => event.stopPropagation()}>
      <h2 id={titleId} style={{ flexShrink: 0 }}>{kind === '隐私政策' ? '食护家隐私政策' : '食护家服务条款'}</h2>
      <div tabIndex={0} aria-label="协议正文" style={{ overflowY: 'auto', overscrollBehavior: 'contain', minHeight: 0, paddingRight: 8 }}>
        {kind === '隐私政策' ? <PrivacyPolicy /> : <ServiceTerms />}
      </div>
      <button className="primary-button" style={{ flexShrink: 0 }} type="button" onClick={onClose}>我知道了</button>
    </section>
  </div>, document.body);
}
