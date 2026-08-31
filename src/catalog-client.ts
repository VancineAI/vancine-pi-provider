import { CATALOG_TIMEOUT_MS, CATALOG_URL, VANCINE_ORIGIN } from "./constants.ts";
import { CatalogError } from "./errors.ts";

export interface CatalogTransportInit {
  method?: string;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  redirect?: RequestRedirect;
}

export type CatalogTransport = (url: string, init: CatalogTransportInit) => Promise<Response>;

export interface CatalogFetchOptions {
  url?: string;
  etag?: string;
  lastModifiedHttp?: string;
  signal: AbortSignal;
  timeoutMs?: number;
  transport?: CatalogTransport;
}

export type CatalogFetchResult =
  | {
      status: "not_modified";
      etag?: string;
      lastModified?: number;
      lastModifiedHttp?: string;
    }
  | {
      status: "ok";
      payload: unknown;
      etag?: string;
      lastModified?: number;
      lastModifiedHttp?: string;
    };

/** Convert a unix-ms timestamp to RFC 1123 HTTP-date. Invalid values return undefined. */
export function httpDateFromTimestamp(timestamp: number | undefined): string | undefined {
  if (typeof timestamp !== "number" || !Number.isFinite(timestamp) || timestamp <= 0) {
    return undefined;
  }
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return undefined;
  }
  return date.toUTCString();
}

function abortError(message: string): Error {
  return Object.assign(new Error(message), { name: "AbortError" });
}

function assertCatalogUrl(urlString: string): URL {
  let url: URL;
  try {
    url = new URL(urlString);
  } catch {
    throw new CatalogError("invalid_catalog", "Catalog URL is invalid");
  }
  if (url.protocol !== "https:") {
    throw new CatalogError("redirect", "Catalog URL must use HTTPS");
  }
  if (url.origin !== VANCINE_ORIGIN) {
    throw new CatalogError("redirect", `Catalog URL origin must be ${VANCINE_ORIGIN}`);
  }
  return url;
}

function header(response: Response, name: string): string | undefined {
  const value = response.headers.get(name);
  return value && value.trim() !== "" ? value : undefined;
}

export async function fetchVancineCatalog(options: CatalogFetchOptions): Promise<CatalogFetchResult> {
  const url = assertCatalogUrl(options.url ?? CATALOG_URL);
  const timeoutMs = options.timeoutMs ?? CATALOG_TIMEOUT_MS;
  const transport = options.transport ?? fetch;
  const controller = new AbortController();
  const onUserAbort = () => controller.abort(abortError("aborted"));
  if (options.signal.aborted) {
    controller.abort(abortError("aborted"));
  } else {
    options.signal.addEventListener("abort", onUserAbort, { once: true });
  }
  const timer = setTimeout(() => {
    controller.abort(abortError("timeout"));
  }, timeoutMs);

  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  if (options.etag) {
    headers["If-None-Match"] = options.etag;
  }
  if (options.lastModifiedHttp) {
    headers["If-Modified-Since"] = options.lastModifiedHttp;
  }

  let response: Response;
  try {
    response = await transport(url.toString(), {
      method: "GET",
      headers,
      signal: controller.signal,
      redirect: "error",
    });
  } catch (error) {
    if (controller.signal.aborted || (error instanceof Error && error.name === "AbortError")) {
      if (options.signal.aborted) {
        throw new CatalogError("aborted", "Catalog request was aborted", { cause: error });
      }
      throw new CatalogError("timeout", `Catalog request timed out after ${timeoutMs}ms`, { cause: error });
    }
    const message = error instanceof Error ? error.message : String(error);
    if (/redirect/i.test(message)) {
      throw new CatalogError("redirect", "Catalog request refused to follow a redirect", { cause: error });
    }
    throw new CatalogError("network", "Catalog request failed", { cause: error });
  } finally {
    clearTimeout(timer);
    options.signal.removeEventListener("abort", onUserAbort);
  }

  if (response.status === 304) {
    const lastModifiedHttp = header(response, "last-modified");
    const lastModified = lastModifiedHttp ? Date.parse(lastModifiedHttp) : Number.NaN;
    return {
      status: "not_modified",
      etag: header(response, "etag") ?? options.etag,
      lastModified: Number.isNaN(lastModified) ? undefined : lastModified,
      lastModifiedHttp,
    };
  }

  if (!response.ok) {
    throw new CatalogError("http", `Catalog request failed with HTTP ${response.status}`);
  }

  const contentType = header(response, "content-type") ?? "";
  if (contentType && !contentType.includes("json") && !contentType.includes("javascript")) {
    throw new CatalogError("invalid_catalog", `Catalog response is not JSON (${contentType})`);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch (error) {
    throw new CatalogError("invalid_catalog", "Catalog response is not valid JSON", { cause: error });
  }

  const lastModifiedHttp = header(response, "last-modified");
  const lastModified = lastModifiedHttp ? Date.parse(lastModifiedHttp) : Number.NaN;

  return {
    status: "ok",
    payload,
    etag: header(response, "etag"),
    lastModified: Number.isNaN(lastModified) ? undefined : lastModified,
    lastModifiedHttp,
  };
}
