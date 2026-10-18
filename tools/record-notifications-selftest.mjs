import assert from 'node:assert/strict';
import { RecordNotificationTracker } from '../src/recordNotifications.ts';

const tracker = new RecordNotificationTracker();
const item = (elder, ...recordIds) => ({ elder, recordIds });
assert.deepEqual(tracker.update([item('a', 'old')]), []);
assert.deepEqual(tracker.update([item('a', 'old', 'new')]), ['a']);
assert.deepEqual(tracker.update([item('a', 'new', 'old')]), []);
assert.deepEqual(tracker.update([item('a', 'old')]), []);
assert.deepEqual(tracker.update([item('a', 'old', 'new')]), []);
assert.deepEqual(tracker.update([item('a', 'old'), item('b', 'history')]), []);
assert.deepEqual(tracker.update([item('a', 'old', 'next'), item('b', 'history', 'one', 'two')]), ['a', 'b']);
assert.deepEqual(tracker.update([]), []);
assert.deepEqual(tracker.update([item('a', 'old', 'next'), item('b', 'history')]), []);
tracker.clear();
assert.deepEqual(tracker.update([item('a', 'old', 'next')]), []);
console.log('PASS 10 record-notification checks: initial baseline, deduplication, deletion, multiple elders, revocation and account reset');
