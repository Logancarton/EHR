/**
 * An API failure that still knows what the server said.
 *
 * `request()` used to throw a bare `Error` carrying only the server's message, which
 * meant every caller could show the text and none could tell a refused session from
 * a bad request. That is how an expired session came to render as an error card
 * inside a workspace that still looked signed in.
 */
export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/** Whether this failure means "no usable session", as opposed to "not allowed". */
export function isAuthenticationFailure(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401;
}

/**
 * Deliberately distinct from the above. A 403 is an authenticated person reaching
 * for something that is not theirs, which is a permission answer and must never
 * produce a re-authentication prompt.
 */
export function isAuthorizationFailure(error: unknown): boolean {
  return error instanceof ApiError && error.status === 403;
}
