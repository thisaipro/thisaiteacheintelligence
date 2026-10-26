/** Safe to share with the browser-side service; no driver or credentials here. */
export class DatabaseUnavailableError extends Error {
  constructor(cause: unknown) {
    super('The database is temporarily unavailable. Please try again.', { cause });
  }
}

export function isDatabaseConnectionError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const code = (error as Error & { code?: string }).code ?? '';
  return ['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'EPIPE', '57P01', '57P02', '57P03'].includes(code)
    || code.startsWith('08')
    || /connection (?:terminated|closed)|client has encountered a connection error|query read timeout|timeout exceeded when trying to connect/i.test(error.message);
}
