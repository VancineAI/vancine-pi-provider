import type { ModelsPublication, ModelsStoreEntry, RefreshModelsContext } from "@earendil-works/pi-ai";
import type { VancineCatalog, VancineCatalogModel } from "../src/catalog.ts";
import { CATALOG_SCHEMA_VERSION, PROVIDER_ID } from "../src/constants.ts";

export const FAKE_KEY = "sk-test-fake-key-not-real-1234567890";

export function chatModel(overrides: Partial<VancineCatalogModel> & Pick<VancineCatalogModel, "id">): VancineCatalogModel {
  return {
    name: overrides.name ?? overrides.id,
    enabled: true,
    available: true,
    kind: "chat",
    api: "openai-completions",
    endpoint: "chat.completions",
    input: ["text"],
    reasoning: false,
    contextWindow: 128000,
    maxTokens: 8192,
    cost: { input: 1, output: 2, cacheRead: 0.1, cacheWrite: 0 },
    ...overrides,
  };
}

export function catalog(models: VancineCatalogModel[]): VancineCatalog {
  return {
    provider: PROVIDER_ID,
    schemaVersion: CATALOG_SCHEMA_VERSION,
    generatedAt: "2026-08-31T08:00:00Z",
    models,
  };
}

export function jsonResponse(body: unknown, init: { status?: number; etag?: string; lastModified?: string } = {}): Response {
  const headers = new Headers({ "content-type": "application/json" });
  if (init.etag) {
    headers.set("etag", init.etag);
  }
  if (init.lastModified) {
    headers.set("last-modified", init.lastModified);
  }
  return new Response(JSON.stringify(body), { status: init.status ?? 200, headers });
}

export function hangingTransport(): (url: string, init: { signal?: AbortSignal }) => Promise<Response> {
  return (_url, init) =>
    new Promise((_, reject) => {
      const signal = init.signal;
      const fail = () => reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
      if (signal?.aborted) {
        fail();
        return;
      }
      signal?.addEventListener("abort", fail, { once: true });
    });
}

export interface MockRefresh {
  context: RefreshModelsContext;
  persisted: ModelsStoreEntry | null | undefined;
  persistCalls: Array<ModelsStoreEntry | null>;
  published: boolean;
}

export function mockRefresh(init: {
  stored?: ModelsStoreEntry;
  allowNetwork?: boolean;
  force?: boolean;
  signal?: AbortSignal;
  credential?: RefreshModelsContext["credential"];
  publishResult?: boolean;
} = {}): MockRefresh {
  const state: MockRefresh = {
    context: undefined as unknown as RefreshModelsContext,
    persisted: undefined,
    persistCalls: [],
    published: true,
  };
  let stored = init.stored;
  state.context = {
    credential: init.credential,
    get stored() {
      return stored;
    },
    allowNetwork: init.allowNetwork ?? true,
    force: init.force,
    signal: init.signal ?? new AbortController().signal,
    async publish(publication: ModelsPublication): Promise<boolean> {
      if (init.publishResult === false) {
        state.published = false;
        return false;
      }
      if (publication.persist !== undefined) {
        stored = publication.persist ?? undefined;
        state.persisted = publication.persist;
        state.persistCalls.push(publication.persist);
      }
      publication.update?.();
      return true;
    },
  };
  return state;
}
