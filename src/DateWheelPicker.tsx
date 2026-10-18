import { useEffect, useId, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { ageFromBirthDate, birthdayLimits, birthdayParts, birthdayValue, calendarDate, clampBirthday } from './birthDate';
import './DateWheelPicker.css';

const ROW_HEIGHT = 44;
const range = (start: number, end: number) => Array.from({ length: end - start + 1 }, (_, index) => start + index);
function wheelValue(element: HTMLDivElement | null, values: number[], fallback: number) {
  return element ? values[Math.max(0, Math.min(values.length - 1, Math.round(element.scrollTop / ROW_HEIGHT)))] : fallback;
}

function WheelColumn({ label, values, selected, onSelect, scrollRef }: {
  label: string; values: number[]; selected: number; onSelect: (value: number) => void; scrollRef: RefObject<HTMLDivElement | null>;
}) {
  const id = useId();
  const [active, setActive] = useState(selected);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const current = useRef({ values, selected, onSelect });
  current.current = { values, selected, onSelect };
  const signature = values.join(',');
  const stopTimer = () => { if (timer.current) clearTimeout(timer.current); };
  useLayoutEffect(() => {
    stopTimer();
    setActive(selected);
    if (scrollRef.current) scrollRef.current.scrollTop = Math.max(0, values.indexOf(selected)) * ROW_HEIGHT;
  }, [selected, signature]);
  useEffect(() => stopTimer, []);
  return <div ref={scrollRef} className="flc-date-wheel" role="listbox" aria-label={label} aria-activedescendant={`${id}-${active}`} tabIndex={0}
    onScroll={() => {
      const value = wheelValue(scrollRef.current, current.current.values, selected);
      setActive(value); stopTimer();
      // Wait for touch/mouse scrolling to settle before changing dependent columns.
      timer.current = setTimeout(() => {
        const latest = current.current;
        const value = wheelValue(scrollRef.current, latest.values, latest.selected);
        if (value !== latest.selected) latest.onSelect(value);
      }, 140);
    }}
    onKeyDown={event => {
      const index = values.indexOf(active);
      const delta = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0;
      if (!delta && !['Home', 'End', 'PageUp', 'PageDown'].includes(event.key)) return;
      event.preventDefault(); stopTimer();
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? values.length - 1 : index + (event.key === 'PageUp' ? -10 : event.key === 'PageDown' ? 10 : delta);
      onSelect(values[Math.max(0, Math.min(values.length - 1, next))]);
    }}>
    {values.map(value => <div key={value} id={`${id}-${value}`} role="option" aria-selected={active === value}
      className={active === value ? 'flc-date-option is-selected' : 'flc-date-option'}
      onClick={() => { stopTimer(); if (scrollRef.current) scrollRef.current.scrollTop = values.indexOf(value) * ROW_HEIGHT; setActive(value); onSelect(value); }}>
      {value}{label}
    </div>)}
  </div>;
}

export default function DateWheelPicker({ value, onConfirm, onClose }: { value: string; onConfirm: (value: string) => void; onClose: () => void }) {
  const [today] = useState(calendarDate);
  const limits = birthdayLimits(today);
  const [draft, setDraft] = useState(() => birthdayParts(ageFromBirthDate(value, today) !== '' ? value : today));
  const titleId = useId();
  const dialogRef = useRef<HTMLElement>(null);
  const yearRef = useRef<HTMLDivElement>(null), monthRef = useRef<HTMLDivElement>(null), dayRef = useRef<HTMLDivElement>(null);
  const close = useRef(onClose); close.current = onClose;
  const min = birthdayParts(limits.min), max = birthdayParts(limits.max);
  const years = range(min.year, max.year);
  const months = range(draft.year === min.year ? min.month : 1, draft.year === max.year ? max.month : 12);
  const days = range(draft.year === min.year && draft.month === min.month ? min.day : 1,
    draft.year === max.year && draft.month === max.month ? max.day : new Date(Date.UTC(draft.year, draft.month, 0)).getUTCDate());
  const select = (key: 'year' | 'month' | 'day', value: number) => setDraft(previous => {
    const next = clampBirthday({ ...previous, [key]: value }, limits);
    return birthdayValue(previous) === birthdayValue(next) ? previous : next;
  });
  useEffect(() => {
    const focus = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden'; dialogRef.current?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close.current(); }
      if (event.key !== 'Tab') return;
      const items = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button, [tabindex="0"]') || []);
      const first = items[0], last = items[items.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialogRef.current)) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', handleKey, true);
    return () => {
      document.removeEventListener('keydown', handleKey, true); document.body.style.overflow = overflow;
      if (focus instanceof HTMLElement && focus.isConnected) focus.focus();
    };
  }, []);
  const confirm = () => {
    // Read the visible wheel positions even if the user confirms before scroll settles.
    const selected = clampBirthday({ year: wheelValue(yearRef.current, years, draft.year), month: wheelValue(monthRef.current, months, draft.month), day: wheelValue(dayRef.current, days, draft.day) }, limits);
    onConfirm(birthdayValue(selected));
  };
  return createPortal(<div className="flc-date-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section ref={dialogRef} className="flc-date-sheet" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
      <header className="flc-date-header">
        <button type="button" onClick={onClose}>取消</button>
        <h2 id={titleId}>选择出生日期</h2>
        <button type="button" className="flc-date-confirm" onClick={confirm}>确定</button>
      </header>
      <div className="flc-date-columns">
        <div className="flc-date-band" aria-hidden="true" />
        <WheelColumn label="年" values={years} selected={draft.year} onSelect={value => select('year', value)} scrollRef={yearRef} />
        <WheelColumn label="月" values={months} selected={draft.month} onSelect={value => select('month', value)} scrollRef={monthRef} />
        <WheelColumn label="日" values={days} selected={draft.day} onSelect={value => select('day', value)} scrollRef={dayRef} />
      </div>
      <footer className="flc-date-footer"><button type="button" onClick={() => onConfirm('')}>清除日期</button></footer>
    </section>
  </div>, document.body);
}
