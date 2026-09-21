/**
 * Shared request parsing for the HR write routes (D-086).
 *
 * Unknown fields are rejected rather than ignored. A personnel write that silently
 * dropped a field the caller believed it had sent is how an assignment ends up looking
 * applied when it was not.
 */

export async function hrRequestBody(
  req: Request,
  allowed: readonly string[],
): Promise<Record<string, unknown>> {
  const body: unknown = await req.json();
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("Request body must be an object.");
  }
  for (const key of Object.keys(body)) {
    if (!allowed.includes(key)) throw new Error(`Request contains an unexpected field: ${key}.`);
  }
  return body as Record<string, unknown>;
}

export function optionalHrString(value: unknown, field: string, max: number): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string" || value.length > max) throw new Error(`${field} is invalid.`);
  return value;
}
