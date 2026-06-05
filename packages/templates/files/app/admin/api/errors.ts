export class AdminApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'AdminApiError';
    this.status = status;
  }
}

// Extracts a useful message from a non-2xx Response. Tries to read a JSON
// `{ error: string }` body (the shape every admin route returns on failure)
// and falls back to `HTTP <status>` when the body is missing or malformed.
export async function parseJsonError(res: Response): Promise<AdminApiError> {
  let message = `HTTP ${res.status}`;
  try {
    const data = (await res.json()) as { error?: unknown };
    if (typeof data?.error === 'string' && data.error.length > 0) {
      message = data.error;
    }
  } catch {
    // body wasn't JSON — keep the HTTP fallback
  }
  return new AdminApiError(message, res.status);
}
