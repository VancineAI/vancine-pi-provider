export type CatalogErrorCode =
  | "invalid_catalog"
  | "http"
  | "timeout"
  | "redirect"
  | "aborted"
  | "network";

export class CatalogError extends Error {
  readonly code: CatalogErrorCode;

  constructor(code: CatalogErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "CatalogError";
    this.code = code;
  }
}

export function redactSecret(text: string, secret: string | undefined): string {
  if (!secret || secret.length < 4) {
    return text;
  }
  return text.split(secret).join("[redacted]");
}

export function errorMessage(error: unknown, secret?: string): string {
  const raw = error instanceof Error ? error.message : String(error);
  return redactSecret(raw, secret);
}
