import { useState } from 'react';
import { ageFromBirthDate } from './birthDate';
import DateWheelPicker from './DateWheelPicker';

export default function BirthDateFields({ id, birthDate, onChange, child = false }: {
  id: string; birthDate: string; age: string; onChange: (value: { birthDate: string; age: string }) => void; child?: boolean;
}) {
  const fieldClass = child ? 'child-edit-field' : 'form-field';
  const [open, setOpen] = useState(false);
  return <>
    <div className={fieldClass}>
      <label htmlFor={`${id}-birth-date`}>出生日期（选填）</label>
      <button id={`${id}-birth-date`} className="profile-input" type="button" value={birthDate} aria-haspopup="dialog" aria-expanded={open}
        style={{ minWidth: 0, width: '100%', maxWidth: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', textAlign: 'left' }}
        onClick={() => setOpen(true)}>
        <span>{birthDate ? birthDate.replaceAll('-', '/') : '请选择出生日期'}</span><img alt="" width={20} height={20} src="assets/25744.svg" />
      </button>
    </div>
    <div className={fieldClass}>
      <label htmlFor={`${id}-age`}>年龄</label>
      <div className="profile-input-shell">
        <input id={`${id}-age`} readOnly value={birthDate ? ageFromBirthDate(birthDate) : '未设置'} />{birthDate && <span>岁</span>}
      </div>
    </div>
    {open && <DateWheelPicker value={birthDate} onClose={() => setOpen(false)} onConfirm={value => { onChange({ birthDate: value, age: value ? ageFromBirthDate(value) : '' }); setOpen(false); }} />}
  </>;
}
