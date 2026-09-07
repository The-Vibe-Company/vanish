export type SizedRequestBody =
  | { ok: true; body: ReadableStream<Uint8Array>; size: number }
  | { ok: false; reason: 'length_required' | 'invalid_length' | 'empty' | 'too_large' };

export function getSizedRequestBody(request: Request, maxBytes: number): SizedRequestBody {
  const rawLength = request.headers.get('Content-Length');
  if (rawLength === null) {
    return { ok: false, reason: 'length_required' };
  }
  if (!/^\d+$/.test(rawLength)) {
    return { ok: false, reason: 'invalid_length' };
  }

  const size = Number(rawLength);
  if (!Number.isSafeInteger(size)) {
    return { ok: false, reason: 'invalid_length' };
  }
  if (size === 0) {
    return { ok: false, reason: 'empty' };
  }
  if (size > maxBytes) {
    return { ok: false, reason: 'too_large' };
  }
  if (!request.body) {
    return { ok: false, reason: 'invalid_length' };
  }

  return { ok: true, body: request.body, size };
}
