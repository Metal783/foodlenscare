import assert from 'node:assert/strict';
import { requestSignal } from '../src/requestSignal.ts';
import { recordNeedsAttention } from '../src/recordStatus.ts';
const record = (level, recommendation) => ({ assessment: { level }, aiAnalysis: recommendation ? { recommendation } : undefined });
for (const [level, recommendation, attention] of [
  ['gray', 'moderate', false], ['green', 'caution', true], ['gray', 'unknown', true],
  ['red', 'moderate', true], ['green', undefined, false], ['gray', undefined, true],
]) assert.equal(recordNeedsAttention(record(level, recommendation)), attention);
const parent = new AbortController(), timed = requestSignal(parent.signal, 20);
await new Promise(resolve => setTimeout(resolve, 40));
assert(timed.signal.aborted && !parent.signal.aborted);
assert.equal(timed.signal.reason.name, 'TimeoutError'); timed.dispose();
const canceled = new AbortController(), combined = requestSignal(canceled.signal, 1000);
canceled.abort(new DOMException('cancel', 'AbortError'));
assert(combined.signal.aborted); assert.equal(combined.signal.reason.name, 'AbortError'); combined.dispose();
const disposed = requestSignal(undefined, 10); disposed.dispose();
await new Promise(resolve => setTimeout(resolve, 25)); assert(!disposed.signal.aborted);
const already = new AbortController(); already.abort();
const immediate = requestSignal(already.signal); assert(immediate.signal.aborted); immediate.dispose();
console.log('PASS common attention states, external cancellation + timeout, already-aborted callers and timer disposal');
