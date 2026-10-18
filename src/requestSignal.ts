/** Apply the deadline even when a caller supplies its own cancellation signal. */
export class RequestError extends Error {
  status: number;
  constructor(message: string, status: number) { super(message); this.status = status; }
}
export function requestSignal(signal?: AbortSignal, timeoutMs = 15000) {
  const controller = new AbortController();
  const abort = () => controller.abort(signal?.reason);
  if (signal?.aborted) abort();
  else signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(() => controller.abort(new DOMException('请求超时，请重试。', 'TimeoutError')), timeoutMs);
  return { signal: controller.signal, dispose() { clearTimeout(timer); signal?.removeEventListener('abort', abort); } };
}
