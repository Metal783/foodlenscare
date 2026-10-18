import assert from 'node:assert/strict';
import { ageFromBirthDate, calendarDate, profileAge, birthdayLimits, birthdayValue, clampBirthday } from '../src/birthDate.ts';

for (const [birthday, today, expected] of [
  ['1958-10-17', '2026-10-16', '67'], ['1958-10-17', '2026-10-17', '68'],
  ['1958-10-17', '2026-10-18', '68'], ['2000-02-29', '2025-02-28', '24'],
  ['2000-02-29', '2025-03-01', '25'], ['2000-02-29', '2024-02-29', '24'],
  ['2026-10-17', '2026-10-17', '0'], ['2026-10-18', '2026-10-17', ''],
  ['1905-10-18', '2026-10-17', '120'], ['1905-10-17', '2026-10-17', ''],
  ['2025-02-29', '2026-10-17', ''], ['2000-2-29', '2026-10-17', ''],
  ['2000-02-30', '2026-10-17', ''], ['', '2026-10-17', ''],
]) assert.equal(ageFromBirthDate(birthday, today), expected, `${birthday} on ${today}`);
assert.equal(calendarDate(new Date('2026-10-16T16:00:00Z')), '2026-10-17');
assert.equal(calendarDate(new Date('2026-10-16T15:59:59Z')), '2026-10-16');
assert.equal(profileAge({ age: 68 }), '68');
assert.equal(profileAge({ birthDate: '2999-01-01', age: '68' }), '');
for (const today of ['2026-10-17', '2024-02-29', '2025-03-01', '2026-12-31']) {
  const limits = birthdayLimits(today);
  assert.equal(ageFromBirthDate(limits.min, today), '120');
  const previous = new Date(limits.min + 'T00:00:00Z'); previous.setUTCDate(previous.getUTCDate() - 1);
  assert.equal(ageFromBirthDate(previous.toISOString().slice(0, 10), today), '');
  assert.equal(limits.max, today);
}
assert.equal(birthdayValue(clampBirthday({ year: 2025, month: 2, day: 29 }, birthdayLimits('2026-10-17'))), '2025-02-28');
assert.equal(birthdayValue(clampBirthday({ year: 2999, month: 12, day: 31 }, birthdayLimits('2026-10-17'))), '2026-10-17');
console.log('PASS 32 birth-date checks: birthday/leap boundaries, valid min/max wheel ranges, month clamping, future-date rejection, Shanghai calendar and legacy storage');
