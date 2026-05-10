export interface JsonErrorOptions {
  json?: boolean;
}

export function fail(message: string, options: JsonErrorOptions = {}, code = 'cli_error'): never {
  if (options.json) {
    console.log(JSON.stringify({
      ok: false,
      error: message,
      code,
      message,
      retryable: false,
    }, null, 2));
  } else {
    console.error(message);
  }

  process.exit(1);
}

export function failWithUnknownError(err: unknown, options: JsonErrorOptions = {}, fallback = 'Command failed'): never {
  if (isVanishApiError(err)) {
    if (options.json) {
      console.log(JSON.stringify({
        ok: false,
        error: err.message,
        code: err.code,
        message: err.message,
        status: err.status,
        hint: err.hint,
        retryable: err.retryable,
        limits: err.limits,
        upgradeRequired: err.upgradeRequired,
      }, null, 2));
    } else {
      console.error(err.message);
      if (err.hint) {
        console.error(err.hint);
      }
    }
    process.exit(1);
  }

  fail(err instanceof Error ? err.message : fallback, options);
}

function isVanishApiError(err: unknown): err is Error & {
  code: string;
  status: number;
  hint?: string;
  retryable: boolean;
  limits?: Record<string, unknown>;
  upgradeRequired?: boolean;
} {
  return err instanceof Error
    && typeof (err as { code?: unknown }).code === 'string'
    && typeof (err as { status?: unknown }).status === 'number'
    && typeof (err as { retryable?: unknown }).retryable === 'boolean';
}
