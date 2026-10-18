export function calendarDate(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const value = (type: string) => parts.find(part => part.type === type)!.value;
  return `${value('year')}-${value('month')}-${value('day')}`;
}

export function ageFromBirthDate(value: string, today = calendarDate()): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value > today) return '';
  const date = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) return '';
  const [year, month, day] = value.split('-').map(Number);
  const [currentYear, currentMonth, currentDay] = today.split('-').map(Number);
  const age = currentYear - year - Number(currentMonth < month || currentMonth === month && currentDay < day);
  return age >= 0 && age <= 120 ? String(age) : '';
}

export function birthDateIssue(value: string): string {
  if (!value) return '';
  if (value > calendarDate() && /^\d{4}-\d{2}-\d{2}$/.test(value)) return '出生日期不能晚于今天';
  return ageFromBirthDate(value) === '' ? '请选择有效的出生日期，年龄需在0至120岁之间' : '';
}

export function profileAge(profile: { birthDate?: string; age?: string | number | null }): string {
  return profile.birthDate ? ageFromBirthDate(profile.birthDate) : profile.age == null ? '' : String(profile.age);
}

export function birthdayLimits(today = calendarDate()) {
  const [year, month, day] = today.split('-').map(Number);
  const earliest = new Date(Date.UTC(year - 121, month - 1, day));
  if (ageFromBirthDate(earliest.toISOString().slice(0, 10), today) === '') earliest.setUTCDate(earliest.getUTCDate() + 1);
  return { min: earliest.toISOString().slice(0, 10), max: today };
}

export function birthdayParts(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  return { year, month, day };
}

export function clampBirthday(parts: { year: number; month: number; day: number }, limits = birthdayLimits()) {
  const min = birthdayParts(limits.min), max = birthdayParts(limits.max);
  const year = Math.min(max.year, Math.max(min.year, parts.year));
  const firstMonth = year === min.year ? min.month : 1;
  const lastMonth = year === max.year ? max.month : 12;
  const month = Math.min(lastMonth, Math.max(firstMonth, parts.month));
  const firstDay = year === min.year && month === min.month ? min.day : 1;
  const lastDay = year === max.year && month === max.month ? max.day : new Date(Date.UTC(year, month, 0)).getUTCDate();
  const day = Math.min(lastDay, Math.max(firstDay, parts.day));
  return { year, month, day };
}

export function birthdayValue(parts: { year: number; month: number; day: number }) {
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}
