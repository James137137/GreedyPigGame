/** Shared response format for the public Worker and the private room object. */
export function json(data: unknown, status = 200, cookie?: string): Response {
  const headers = new Headers({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
  });
  if (cookie) headers.set('Set-Cookie', cookie);
  return new Response(JSON.stringify(data), { status, headers });
}

export function problem(status: number, message: string): Response {
  return json({ error: message, message }, status);
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export class InvalidRequest extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

/** Bound the actual stream as Content-Length may be absent. */
export async function readForm(request: Request): Promise<Record<string, unknown>> {
  if (request.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
    throw new InvalidRequest(415, 'Send the form as JSON.');
  }
  const reader = request.body?.getReader();
  if (!reader) throw new InvalidRequest(400, 'The form was empty.');
  const decoder = new TextDecoder();
  let size = 0;
  let text = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 1024) {
        await reader.cancel();
        throw new InvalidRequest(413, 'The form is too large.');
      }
      text += decoder.decode(value, { stream: true });
    }
  } finally {
    reader.releaseLock();
  }
  try {
    const form: unknown = JSON.parse(text + decoder.decode());
    if (isRecord(form)) return form;
  } catch { /* Return a single form error for malformed JSON. */ }
  throw new InvalidRequest(400, 'The form contains invalid JSON.');
}
