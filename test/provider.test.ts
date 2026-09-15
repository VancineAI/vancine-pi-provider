import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CatalogError } from "../src/errors.ts";
import { FALLBACK_MODELS } from "../src/fallback-models.ts";
import { createVancineProvider } from "../src/provider.ts";
import { BASE_URL, PROVIDER_ID, PROVIDER_NAME } from "../src/constants.ts";
import type { ModelsStoreEntry } from "@earendil-works/pi-ai";
import { catalog, chatModel, FAKE_KEY, hangingTransport, jsonResponse, mockRefresh } from "./helpers.ts";

const credential = { type: "api_key" as const, key: FAKE_KEY };

function cachedDeepSeekFlash() {
  return {
    id: "deepseek-flash",
    name: "DeepSeek V4.1 Flash",
    api: "openai-completions" as const,
    provider: "vancine",
    baseUrl: BASE_URL,
    reasoning: true,
    input: ["text", "image"] as ("text" | "image")[],
    cost: { input: 0.24, output: 0.96, cacheRead: 0.0048, cacheWrite: 0 },
    contextWindow: 1_000_000,
    maxTokens: 384_000,
    compat: { supportsDeveloperRole: false, supportsReasoningEffort: true },
  };
}

function liveDeepSeekV41Flash() {
  return chatModel({
    id: "deepseek-v4.1-flash",
    name: "DeepSeek V4.1 Flash",
    input: ["text", "image"],
    reasoning: true,
    contextWindow: 1_000_000,
    maxTokens: 384_000,
    cost: { input: 0.24, output: 0.96, cacheRead: 0.0048, cacheWrite: 0 },
    compat: { supportsDeveloperRole: false, supportsReasoningEffort: true },
  });
}

function ids(provider: ReturnType<typeof createVancineProvider>): string[] {
  return provider.getModels().map((model) => model.id);
}

async function runRefresh(
  provider: ReturnType<typeof createVancineProvider>,
  context: Parameters<NonNullable<ReturnType<typeof createVancineProvider>["refreshModels"]>>[0],
): Promise<void> {
  const run = provider.refreshModels;
  if (!run) {
    throw new Error("refreshModels is required");
  }
  await run(context);
}

describe("provider registration", () => {
  it("registers Vancine with the approved id, name, base URL, and API", () => {
    const provider = createVancineProvider();
    assert.equal(provider.id, PROVIDER_ID);
    assert.equal(provider.name, PROVIDER_NAME);
    assert.equal(provider.baseUrl, BASE_URL);
    assert.equal(provider.auth.apiKey?.name, "Vancine API key");
    assert.ok(provider.auth.apiKey?.login);
    assert.equal(typeof provider.refreshModels, "function");
    assert.deepEqual(provider.getModels(), []);
  });

  it("forces supportsDeveloperRole false on fallback and converted models", async () => {
    const provider = createVancineProvider({
      transport: async () => {
        throw new Error("offline");
      },
    });
    const refresh = mockRefresh({ credential, force: true });
    await assert.rejects(() => runRefresh(provider, refresh.context));
    assert.ok(provider.getModels().length > 0);
    for (const model of provider.getModels()) {
      assert.equal(model.api, "openai-completions");
      const compat = model.compat as { supportsDeveloperRole?: boolean } | undefined;
      assert.equal(compat?.supportsDeveloperRole, false);
    }
  });
});

describe("dynamic catalog refresh", () => {
  it("publishes the first successful catalog", async () => {
    const provider = createVancineProvider({
      transport: async () => jsonResponse(catalog([chatModel({ id: "hy4-preview", name: "Hy4 preview" })]), { etag: '"v1"' }),
    });
    const refresh = mockRefresh({ credential });
    await runRefresh(provider, refresh.context);
    assert.deepEqual(ids(provider), ["hy4-preview"]);
    assert.equal(refresh.persisted?.models[0]?.id, "hy4-preview");
    assert.equal(refresh.persisted?.etag, '"v1"');
    assert.equal(JSON.stringify(refresh.persisted).includes(FAKE_KEY), false);
    assert.equal(JSON.stringify(refresh.persisted).toLowerCase().includes("authorization"), false);
  });

  it("publishes the online catalog alone, without any fallback model", async () => {
    const provider = createVancineProvider({
      transport: async () =>
        jsonResponse(
          catalog([
            chatModel({
              id: "deepseek-v4.1-flash",
              name: "DeepSeek V4.1 Flash",
              input: ["text", "image"],
              reasoning: true,
              contextWindow: 1_000_000,
              maxTokens: 384_000,
              cost: { input: 0.24, output: 0.96, cacheRead: 0.0048, cacheWrite: 0 },
              compat: { supportsDeveloperRole: false, supportsReasoningEffort: true },
            }),
          ]),
          { etag: '"v2"' },
        ),
    });
    await runRefresh(provider, mockRefresh({ credential, force: true }).context);
    assert.deepEqual(ids(provider), ["deepseek-v4.1-flash"]);
    for (const id of ["hy4-preview", "glm-5.3-flash", "qwen3.8-flash"]) {
      assert.equal(ids(provider).includes(id), false, `${id} must not leak in while the catalog succeeded`);
    }
    const model = provider.getModels()[0]!;
    assert.equal((model.compat as { supportsReasoningEffort?: boolean }).supportsReasoningEffort, true);
  });

  it("adds newly compatible models after a later refresh", async () => {
    const payloads = [
      catalog([chatModel({ id: "a" })]),
      catalog([chatModel({ id: "a" }), chatModel({ id: "b" })]),
    ];
    const provider = createVancineProvider({
      refreshIntervalMs: 0,
      transport: async () => jsonResponse(payloads.shift()),
    });
    const first = mockRefresh({ credential, force: true });
    await runRefresh(provider, first.context);
    const second = mockRefresh({ credential, stored: first.persisted ?? undefined, force: true });
    await runRefresh(provider, second.context);
    assert.deepEqual(ids(provider), ["a", "b"]);
  });

  it("replaces updated model metadata", async () => {
    const payloads = [
      catalog([chatModel({ id: "a", name: "Old", contextWindow: 1000, maxTokens: 10 })]),
      catalog([chatModel({ id: "a", name: "New", contextWindow: 2000, maxTokens: 20 })]),
    ];
    const provider = createVancineProvider({
      refreshIntervalMs: 0,
      transport: async () => jsonResponse(payloads.shift()),
    });
    const first = mockRefresh({ credential, force: true });
    await runRefresh(provider, first.context);
    const second = mockRefresh({ credential, stored: first.persisted ?? undefined, force: true });
    await runRefresh(provider, second.context);
    assert.equal(provider.getModels()[0]?.name, "New");
    assert.equal(provider.getModels()[0]?.contextWindow, 2000);
    assert.equal(provider.getModels()[0]?.maxTokens, 20);
  });

  it("drops delisted models after a successful refresh, including fallback ids", async () => {
    const provider = createVancineProvider({
      refreshIntervalMs: 0,
      transport: async () => jsonResponse(catalog([chatModel({ id: "only-live" })])),
    });
    const first = mockRefresh({
      credential,
      stored: { models: [...FALLBACK_MODELS], checkedAt: 1 },
      force: true,
    });
    await runRefresh(provider, first.context);
    assert.deepEqual(ids(provider), ["only-live"]);
    assert.equal(
      provider.getModels().some((model) => model.id === "hy4-preview"),
      false,
    );
  });

  it("migrates a fresh cache that still contains deepseek-flash without sending old validators", async () => {
    const headers: Array<Record<string, string> | undefined> = [];
    const provider = createVancineProvider({
      refreshIntervalMs: 60_000,
      transport: async (_url, init) => {
        headers.push(init.headers);
        return jsonResponse(catalog([liveDeepSeekV41Flash(), chatModel({ id: "hy4-preview" })]), {
          etag: '"v41"',
        });
      },
    });
    const refresh = mockRefresh({
      credential,
      stored: {
        models: [cachedDeepSeekFlash()],
        checkedAt: Date.now(),
        etag: '"old-flash"',
        lastModified: 1_700_000_000_000,
      },
    });
    await runRefresh(provider, refresh.context);
    assert.equal(headers.length, 1);
    assert.equal(headers[0]?.["If-None-Match"], undefined);
    assert.equal(headers[0]?.["If-Modified-Since"], undefined);
    assert.deepEqual(ids(provider), ["deepseek-v4.1-flash", "hy4-preview"]);
    assert.equal(ids(provider).includes("deepseek-flash"), false);
    assert.deepEqual(
      refresh.persisted?.models.map((model) => model.id),
      ["deepseek-v4.1-flash", "hy4-preview"],
    );
  });

  it("drops retired deepseek-flash on migration failure but keeps other cached models and retries later", async () => {
    const firstProvider = createVancineProvider({
      refreshIntervalMs: 60_000,
      transport: async () => {
        throw new Error("ECONNRESET");
      },
    });
    const first = mockRefresh({
      credential,
      stored: {
        models: [cachedDeepSeekFlash(), FALLBACK_MODELS[0]!],
        checkedAt: Date.now(),
        etag: '"old-flash"',
      },
    });
    await assert.rejects(() => runRefresh(firstProvider, first.context), CatalogError);
    assert.deepEqual(ids(firstProvider), ["hy4-preview"]);
    assert.equal(ids(firstProvider).includes("deepseek-flash"), false);
    assert.deepEqual(
      first.persisted?.models.map((model) => model.id),
      ["hy4-preview"],
    );
    assert.equal(first.persisted?.checkedAt, undefined);
    assert.equal(first.persisted?.etag, undefined);
    assert.equal(
      first.persisted?.models.some((model) => FALLBACK_MODELS.some((fallback) => fallback.id === model.id) && model.id !== "hy4-preview"),
      false,
    );

    let calls = 0;
    const retryProvider = createVancineProvider({
      refreshIntervalMs: 60_000,
      transport: async () => {
        calls += 1;
        return jsonResponse(
          catalog([chatModel({ id: "hy4-preview" }), liveDeepSeekV41Flash(), chatModel({ id: "glm-5.3-flash" })]),
        );
      },
    });
    const retry = mockRefresh({
      credential,
      stored: first.persisted ?? undefined,
    });
    await runRefresh(retryProvider, retry.context);
    assert.equal(calls, 1);
    assert.deepEqual(ids(retryProvider), ["hy4-preview", "deepseek-v4.1-flash", "glm-5.3-flash"]);
    assert.equal(ids(retryProvider).includes("deepseek-flash"), false);
  });

  it("does not restore deepseek-flash or persist credentials when a migration is aborted", async () => {
    const controller = new AbortController();
    let started: () => void = () => {};
    const sawRequest = new Promise<void>((resolve) => {
      started = resolve;
    });
    const provider = createVancineProvider({
      refreshIntervalMs: 60_000,
      transport: async (url, init) => {
        started();
        return hangingTransport()(url, init);
      },
    });
    const refresh = mockRefresh({
      credential,
      signal: controller.signal,
      stored: {
        models: [cachedDeepSeekFlash(), FALLBACK_MODELS[0]!],
        checkedAt: Date.now(),
        etag: '"old-flash"',
      },
    });
    const pending = runRefresh(provider, refresh.context);
    await sawRequest;
    controller.abort();
    await pending;
    assert.equal(ids(provider).includes("deepseek-flash"), false);
    assert.deepEqual(ids(provider), ["hy4-preview"]);
    assert.equal(JSON.stringify(refresh.persistCalls).includes(FAKE_KEY), false);
    assert.equal(JSON.stringify(refresh.persisted).includes(FAKE_KEY), false);
    if (refresh.persisted) {
      assert.equal(
        refresh.persisted.models.some((model) => model.id === "deepseek-flash"),
        false,
      );
      assert.equal(refresh.persisted.checkedAt, undefined);
    }
  });

  it("treats a 304 during retired-id migration as failure and retries later", async () => {
    const headers: Array<Record<string, string> | undefined> = [];
    const firstProvider = createVancineProvider({
      refreshIntervalMs: 60_000,
      transport: async (_url, init) => {
        headers.push(init.headers);
        return new Response(null, { status: 304, headers: { etag: '"stale"' } });
      },
    });
    const first = mockRefresh({
      credential,
      stored: {
        models: [cachedDeepSeekFlash(), FALLBACK_MODELS[0]!],
        checkedAt: Date.now(),
        etag: '"old-flash"',
        lastModified: 1_700_000_000_000,
      },
    });
    await assert.rejects(() => runRefresh(firstProvider, first.context), CatalogError);
    assert.equal(headers.length, 1);
    assert.equal(headers[0]?.["If-None-Match"], undefined);
    assert.equal(headers[0]?.["If-Modified-Since"], undefined);
    assert.deepEqual(ids(firstProvider), ["hy4-preview"]);
    assert.equal(ids(firstProvider).includes("deepseek-flash"), false);
    assert.deepEqual(
      first.persisted?.models.map((model) => model.id),
      ["hy4-preview"],
    );
    assert.equal(first.persisted?.checkedAt, undefined);
    assert.equal(first.persisted?.etag, undefined);
    assert.equal(first.persisted?.lastModified, undefined);

    let calls = 0;
    const retryProvider = createVancineProvider({
      refreshIntervalMs: 60_000,
      transport: async () => {
        calls += 1;
        return jsonResponse(catalog([chatModel({ id: "hy4-preview" }), liveDeepSeekV41Flash()]));
      },
    });
    await runRefresh(
      retryProvider,
      mockRefresh({ credential, stored: first.persisted ?? undefined }).context,
    );
    assert.equal(calls, 1);
    assert.deepEqual(ids(retryProvider), ["hy4-preview", "deepseek-v4.1-flash"]);
  });

  it("drops deepseek-flash from a 200 catalog that also contains the new id", async () => {
    const provider = createVancineProvider({
      transport: async () =>
        jsonResponse(
          catalog([
            chatModel({ id: "deepseek-flash", name: "stale" }),
            liveDeepSeekV41Flash(),
            chatModel({ id: "hy4-preview" }),
          ]),
          { etag: '"mixed"' },
        ),
    });
    const refresh = mockRefresh({ credential, force: true });
    await runRefresh(provider, refresh.context);
    assert.deepEqual(ids(provider), ["deepseek-v4.1-flash", "hy4-preview"]);
    assert.deepEqual(
      refresh.persisted?.models.map((model) => model.id),
      ["deepseek-v4.1-flash", "hy4-preview"],
    );
    assert.equal(refresh.persisted?.etag, '"mixed"');
  });

  it("persists an empty catalog when a 200 response is only the retired id", async () => {
    const provider = createVancineProvider({
      refreshIntervalMs: 0,
      transport: async () =>
        jsonResponse(catalog([chatModel({ id: "deepseek-flash" })]), { etag: '"only-retired"' }),
    });
    const refresh = mockRefresh({
      credential,
      stored: { models: [FALLBACK_MODELS[0]!], checkedAt: 1, etag: '"hy4"' },
      force: true,
    });
    await runRefresh(provider, refresh.context);
    assert.deepEqual(ids(provider), []);
    assert.deepEqual(refresh.persisted?.models, []);
    assert.equal(refresh.persisted?.etag, '"only-retired"');
    assert.ok((refresh.persisted?.checkedAt ?? 0) >= 1);
    assert.equal(ids(provider).includes("hy4-preview"), false);
    assert.equal(ids(provider).includes("glm-5.3-flash"), false);
  });

  it("keeps the existing catalog on 304", async () => {
    const stored = {
      models: [
        {
          ...FALLBACK_MODELS[0]!,
        },
      ],
      checkedAt: 1,
      etag: '"abc"',
    };
    const provider = createVancineProvider({
      refreshIntervalMs: 0,
      transport: async () => new Response(null, { status: 304, headers: { etag: '"abc"' } }),
    });
    const refresh = mockRefresh({ credential, stored, force: true });
    await runRefresh(provider, refresh.context);
    assert.deepEqual(ids(provider), ["hy4-preview"]);
    assert.equal(refresh.persisted?.etag, '"abc"');
    assert.ok((refresh.persisted?.checkedAt ?? 0) >= 1);
  });

  it("keeps the last successful cache on network failure and does not persist an empty catalog", async () => {
    const stored = { models: [FALLBACK_MODELS[0]!], checkedAt: 1, etag: '"abc"' };
    const provider = createVancineProvider({
      refreshIntervalMs: 0,
      transport: async () => {
        throw new Error("ECONNRESET");
      },
    });
    const refresh = mockRefresh({ credential, stored, force: true });
    await assert.rejects(() => runRefresh(provider, refresh.context), CatalogError);
    assert.deepEqual(ids(provider), ["hy4-preview"]);
    assert.ok(refresh.persisted);
    assert.equal(refresh.persisted?.models.length, 1);
    assert.equal(refresh.persisted?.etag, '"abc"');
  });

  it("uses the four fallback models only on first run with no cache and a failed fetch", async () => {
    const provider = createVancineProvider({
      transport: async () => {
        throw new Error("offline");
      },
    });
    const refresh = mockRefresh({ credential, force: true });
    await assert.rejects(() => runRefresh(provider, refresh.context), CatalogError);
    assert.deepEqual(ids(provider), [
      "hy4-preview",
      "deepseek-v4.1-flash",
      "glm-5.3-flash",
      "qwen3.8-flash",
    ]);
    assert.equal(refresh.persisted, undefined);
  });

  it("does not send the API key to the catalog request and does not store it", async () => {
    const headers: Array<Record<string, string> | undefined> = [];
    const provider = createVancineProvider({
      transport: async (_url, init) => {
        headers.push(init.headers);
        return jsonResponse(catalog([chatModel({ id: "a" })]));
      },
    });
    const refresh = mockRefresh({ credential, force: true });
    await runRefresh(provider, refresh.context);
    assert.equal(headers[0]?.Authorization, undefined);
    assert.equal(JSON.stringify(headers).includes(FAKE_KEY), false);
    assert.equal(JSON.stringify(refresh.persisted).includes(FAKE_KEY), false);
  });

  it("stops a catalog request with AbortSignal", async () => {
    const controller = new AbortController();
    let started: () => void = () => {};
    const sawRequest = new Promise<void>((resolve) => {
      started = resolve;
    });
    const provider = createVancineProvider({
      transport: async (url, init) => {
        started();
        return hangingTransport()(url, init);
      },
    });
    const refresh = mockRefresh({ credential, signal: controller.signal, force: true });
    const pending = runRefresh(provider, refresh.context);
    await sawRequest;
    controller.abort();
    await pending;
    assert.deepEqual(ids(provider), []);
    assert.deepEqual(refresh.persistCalls, []);
    assert.equal(refresh.persisted, undefined);
  });

  it("keeps a valid cache when a refresh is aborted, without persist or checkedAt updates", async () => {
    const controller = new AbortController();
    let started: () => void = () => {};
    const sawRequest = new Promise<void>((resolve) => {
      started = resolve;
    });
    const provider = createVancineProvider({
      refreshIntervalMs: 0,
      transport: async (url, init) => {
        started();
        return hangingTransport()(url, init);
      },
    });
    const stored = { models: [FALLBACK_MODELS[0]!], checkedAt: 1, etag: '"abc"' };
    const refresh = mockRefresh({
      credential,
      signal: controller.signal,
      force: true,
      stored,
    });
    const pending = runRefresh(provider, refresh.context);
    await sawRequest;
    controller.abort();
    await pending;
    assert.deepEqual(ids(provider), ["hy4-preview"]);
    assert.equal(refresh.persisted, undefined);
    assert.deepEqual(refresh.persistCalls, []);
  });

  it("does not load fallback if a rejected cache is cleared and then the request is aborted", async () => {
    const controller = new AbortController();
    let started: () => void = () => {};
    const sawRequest = new Promise<void>((resolve) => {
      started = resolve;
    });
    const provider = createVancineProvider({
      transport: async (url, init) => {
        started();
        return hangingTransport()(url, init);
      },
    });
    const refresh = mockRefresh({
      credential,
      signal: controller.signal,
      force: true,
      stored: {
        models: [
          {
            ...FALLBACK_MODELS[0]!,
            headers: { Authorization: `Bearer ${FAKE_KEY}` },
          },
        ],
        checkedAt: Date.now(),
        etag: '"stale"',
      },
    });
    const pending = runRefresh(provider, refresh.context);
    await sawRequest;
    controller.abort();
    await pending;
    assert.deepEqual(refresh.persistCalls, [null]);
    assert.equal(refresh.persisted, null);
    assert.deepEqual(ids(provider), []);
  });

  it("times out instead of waiting forever", async () => {
    const provider = createVancineProvider({
      timeoutMs: 20,
      transport: hangingTransport(),
    });
    const refresh = mockRefresh({ credential, force: true });
    await assert.rejects(() => runRefresh(provider, refresh.context), /timed out/);
    assert.deepEqual(ids(provider), [
      "hy4-preview",
      "deepseek-v4.1-flash",
      "glm-5.3-flash",
      "qwen3.8-flash",
    ]);
  });

  it("skips refetch inside the freshness window unless force is set", async () => {
    let calls = 0;
    const provider = createVancineProvider({
      refreshIntervalMs: 60_000,
      transport: async () => {
        calls += 1;
        return jsonResponse(catalog([chatModel({ id: "a" })]));
      },
    });
    const stored = { models: [FALLBACK_MODELS[0]!], checkedAt: Date.now(), etag: '"x"' };
    const refresh = mockRefresh({ credential, stored });
    await runRefresh(provider, refresh.context);
    assert.equal(calls, 0);
    assert.deepEqual(ids(provider), ["hy4-preview"]);
  });
});

describe("cache restore safety", () => {
  it("rebuilds poisoned cache models onto the Vancine origin", async () => {
    const urls: string[] = [];
    const poisoned = {
      ...FALLBACK_MODELS[0]!,
      baseUrl: "https://attacker.example/v1",
      headers: { Host: "attacker.example" },
      compat: { supportsDeveloperRole: true },
    };
    const provider = createVancineProvider({
      transport: async (url) => {
        urls.push(url);
        throw new Error("should not fetch inside freshness window");
      },
    });
    const refresh = mockRefresh({
      credential,
      allowNetwork: false,
      stored: { models: [poisoned], checkedAt: Date.now(), etag: '"x"' },
    });
    await runRefresh(provider, refresh.context);
    const model = provider.getModels()[0];
    assert.equal(model?.id, "hy4-preview");
    assert.equal(model?.baseUrl, BASE_URL);
    assert.equal(model?.provider, PROVIDER_ID);
    assert.equal(model?.api, "openai-completions");
    assert.equal(model?.headers, undefined);
    const compat = model?.compat as { supportsDeveloperRole?: boolean } | undefined;
    assert.equal(compat?.supportsDeveloperRole, false);
    assert.equal(JSON.stringify(provider.getModels()).includes("attacker.example"), false);
    assert.deepEqual(urls, []);
  });

  it("drops a cache that contains Authorization or other secrets", async () => {
    const poisoned = {
      ...FALLBACK_MODELS[0]!,
      headers: { Authorization: `Bearer ${FAKE_KEY}` },
    };
    const provider = createVancineProvider({
      transport: async () => {
        throw new Error("offline");
      },
    });
    const refresh = mockRefresh({
      credential,
      allowNetwork: false,
      stored: { models: [poisoned], checkedAt: 1 },
    });
    await runRefresh(provider, refresh.context);
    assert.deepEqual(ids(provider), []);
    assert.equal(refresh.persisted, null);
    assert.deepEqual(refresh.persistCalls, [null]);
  });
});

describe("empty catalog vs missing cache", () => {
  it("treats a successful empty catalog as a real cache, not first-run fallback", async () => {
    const provider = createVancineProvider({
      refreshIntervalMs: 0,
      transport: async () => jsonResponse(catalog([])),
    });
    const first = mockRefresh({ credential, force: true });
    await runRefresh(provider, first.context);
    assert.deepEqual(ids(provider), []);
    assert.ok(first.persisted);
    assert.deepEqual(first.persisted?.models, []);

    const later = createVancineProvider({
      transport: async () => {
        throw new Error("should not fetch offline");
      },
    });
    const offline = mockRefresh({
      credential,
      allowNetwork: false,
      stored: first.persisted ?? undefined,
    });
    await runRefresh(later, offline.context);
    assert.deepEqual(ids(later), []);
  });

  it("keeps a cached empty catalog when a later refresh fails", async () => {
    const provider = createVancineProvider({
      refreshIntervalMs: 0,
      transport: async () => {
        throw new Error("ECONNRESET");
      },
    });
    const refresh = mockRefresh({
      credential,
      force: true,
      stored: { models: [], checkedAt: 1, etag: '"empty"' },
    });
    await assert.rejects(() => runRefresh(provider, refresh.context), CatalogError);
    assert.deepEqual(ids(provider), []);
  });

  it("does not revive fallback after the last compatible model is delisted", async () => {
    const payloads = [catalog([chatModel({ id: "only-live" })]), catalog([])];
    const provider = createVancineProvider({
      refreshIntervalMs: 0,
      transport: async () => jsonResponse(payloads.shift()),
    });
    const first = mockRefresh({ credential, force: true });
    await runRefresh(provider, first.context);
    assert.deepEqual(ids(provider), ["only-live"]);
    const second = mockRefresh({ credential, stored: first.persisted ?? undefined, force: true });
    await runRefresh(provider, second.context);
    assert.deepEqual(ids(provider), []);

    const failed = createVancineProvider({
      refreshIntervalMs: 0,
      transport: async () => {
        throw new Error("offline");
      },
    });
    const third = mockRefresh({ credential, stored: second.persisted ?? undefined, force: true });
    await assert.rejects(() => runRefresh(failed, third.context), CatalogError);
    assert.deepEqual(ids(failed), []);
  });

  it("does not load fallback during offline restore when there is no cache", async () => {
    const provider = createVancineProvider({
      transport: async () => {
        throw new Error("should not fetch");
      },
    });
    const refresh = mockRefresh({ credential, allowNetwork: false });
    await runRefresh(provider, refresh.context);
    assert.deepEqual(ids(provider), []);
  });

  it("loads the four fallback models only after a first allowed network failure", async () => {
    const provider = createVancineProvider({
      transport: async () => {
        throw new Error("offline");
      },
    });
    await runRefresh(provider, mockRefresh({ credential, allowNetwork: false }).context);
    assert.deepEqual(ids(provider), []);
    await assert.rejects(
      () => runRefresh(provider, mockRefresh({ credential, force: true }).context),
      CatalogError,
    );
    assert.deepEqual(ids(provider), [
      "hy4-preview",
      "deepseek-v4.1-flash",
      "glm-5.3-flash",
      "qwen3.8-flash",
    ]);
  });

  it("does not mix fallback models into a failed refresh of an existing cache", async () => {
    const provider = createVancineProvider({
      refreshIntervalMs: 0,
      transport: async () => {
        throw new Error("ECONNRESET");
      },
    });
    const refresh = mockRefresh({
      credential,
      force: true,
      stored: { models: [FALLBACK_MODELS[0]!], checkedAt: 1, etag: '"abc"' },
    });
    await assert.rejects(() => runRefresh(provider, refresh.context), CatalogError);
    assert.deepEqual(ids(provider), ["hy4-preview"]);
    assert.equal(ids(provider).includes("glm-5.3-flash"), false);
  });

  it("applies the freshness window to an empty catalog", async () => {
    let calls = 0;
    const provider = createVancineProvider({
      refreshIntervalMs: 60_000,
      transport: async () => {
        calls += 1;
        return jsonResponse(catalog([chatModel({ id: "a" })]));
      },
    });
    const refresh = mockRefresh({
      credential,
      stored: { models: [], checkedAt: Date.now(), etag: '"empty"' },
    });
    await runRefresh(provider, refresh.context);
    assert.equal(calls, 0);
    assert.deepEqual(ids(provider), []);
  });
});

describe("conditional catalog revalidation", () => {
  it("sends If-None-Match and If-Modified-Since on the second refresh", async () => {
    const lastModifiedHttp = "Mon, 31 Aug 2026 08:00:34 GMT";
    const captured: Array<Record<string, string> | undefined> = [];
    const provider = createVancineProvider({
      refreshIntervalMs: 0,
      transport: async (_url, init) => {
        captured.push(init.headers);
        if (captured.length === 1) {
          return jsonResponse(catalog([chatModel({ id: "a" })]), {
            etag: '"v1"',
            lastModified: lastModifiedHttp,
          });
        }
        return new Response(null, {
          status: 304,
          headers: { etag: '"v1"', "last-modified": lastModifiedHttp },
        });
      },
    });
    const first = mockRefresh({ credential, force: true });
    await runRefresh(provider, first.context);
    const second = mockRefresh({ credential, stored: first.persisted ?? undefined, force: true });
    await runRefresh(provider, second.context);
    assert.equal(captured[0]?.["If-None-Match"], undefined);
    assert.equal(captured[0]?.["If-Modified-Since"], undefined);
    assert.equal(captured[1]?.["If-None-Match"], '"v1"');
    assert.equal(captured[1]?.["If-Modified-Since"], lastModifiedHttp);
    assert.deepEqual(ids(provider), ["a"]);
    assert.equal(second.persisted?.etag, '"v1"');
    assert.equal(second.persisted?.lastModified, Date.parse(lastModifiedHttp));
  });

  it("does not send If-Modified-Since for invalid lastModified values", async () => {
    let headers: Record<string, string> | undefined;
    const provider = createVancineProvider({
      refreshIntervalMs: 0,
      transport: async (_url, init) => {
        headers = init.headers;
        return jsonResponse(catalog([chatModel({ id: "a" })]));
      },
    });
    await runRefresh(
      provider,
      mockRefresh({
        credential,
        force: true,
        stored: { models: [FALLBACK_MODELS[0]!], checkedAt: 1, etag: '"v1"', lastModified: 0 },
      }).context,
    );
    assert.equal(headers?.["If-None-Match"], '"v1"');
    assert.equal(headers?.["If-Modified-Since"], undefined);
  });
});

describe("rejected cache is not a valid empty catalog", () => {
  const secretStored = {
    models: [
      {
        ...FALLBACK_MODELS[0]!,
        headers: { authorization: `bearer ${FAKE_KEY}` },
      },
    ],
    checkedAt: Date.now(),
    etag: '"stale"',
    lastModified: Date.parse("Mon, 31 Aug 2026 08:00:34 GMT"),
  };

  it("does not honor freshness on a secret cache and fetches without old validators", async () => {
    const captured: Array<Record<string, string> | undefined> = [];
    const provider = createVancineProvider({
      transport: async (_url, init) => {
        captured.push(init.headers);
        return jsonResponse(catalog([chatModel({ id: "live" })]), { etag: '"fresh"' });
      },
    });
    const refresh = mockRefresh({ credential, stored: secretStored });
    await runRefresh(provider, refresh.context);
    assert.equal(captured.length, 1);
    assert.equal(captured[0]?.["If-None-Match"], undefined);
    assert.equal(captured[0]?.["If-Modified-Since"], undefined);
    assert.equal(refresh.persistCalls[0], null);
    assert.deepEqual(ids(provider), ["live"]);
    assert.equal(refresh.persisted?.etag, '"fresh"');
  });

  it("deletes a secret cache and stays empty when network is disallowed", async () => {
    const provider = createVancineProvider({
      transport: async () => {
        throw new Error("should not fetch");
      },
    });
    const refresh = mockRefresh({ credential, allowNetwork: false, stored: secretStored });
    await runRefresh(provider, refresh.context);
    assert.equal(refresh.persisted, null);
    assert.deepEqual(ids(provider), []);
  });

  it("loads the four fallback models after a rejected cache and a failed fetch", async () => {
    const provider = createVancineProvider({
      transport: async () => {
        throw new Error("offline");
      },
    });
    const refresh = mockRefresh({ credential, force: true, stored: secretStored });
    await assert.rejects(() => runRefresh(provider, refresh.context), CatalogError);
    assert.equal(refresh.persistCalls[0], null);
    assert.equal(refresh.persistCalls.includes(null), true);
    assert.equal(
      refresh.persistCalls.some((entry) => entry !== null && entry.etag === '"stale"'),
      false,
    );
    assert.deepEqual(ids(provider), [
      "hy4-preview",
      "deepseek-v4.1-flash",
      "glm-5.3-flash",
      "qwen3.8-flash",
    ]);
  });

  it("rejects a stored snapshot whose models field is not an array", async () => {
    const provider = createVancineProvider({
      transport: async () => {
        throw new Error("should not fetch offline");
      },
    });
    const refresh = mockRefresh({
      credential,
      allowNetwork: false,
      stored: { models: "nope", checkedAt: Date.now(), etag: '"bad"' } as unknown as ModelsStoreEntry,
    });
    await runRefresh(provider, refresh.context);
    assert.equal(refresh.persisted, null);
    assert.deepEqual(ids(provider), []);
  });

  it("rejects a non-empty snapshot whose every model is structurally invalid", async () => {
    const provider = createVancineProvider({
      transport: async () => {
        throw new Error("should not fetch offline");
      },
    });
    const refresh = mockRefresh({
      credential,
      allowNetwork: false,
      stored: {
        models: [{ id: "broken" }] as unknown as ModelsStoreEntry["models"],
        checkedAt: Date.now(),
        etag: '"broken"',
      },
    });
    await runRefresh(provider, refresh.context);
    assert.equal(refresh.persisted, null);
    assert.deepEqual(ids(provider), []);
  });

  it("keeps a legitimate empty models array as valid empty, not fallback", async () => {
    const provider = createVancineProvider({
      transport: async () => {
        throw new Error("offline");
      },
    });
    const refresh = mockRefresh({
      credential,
      force: true,
      stored: { models: [], checkedAt: 1, etag: '"empty"' },
    });
    await assert.rejects(() => runRefresh(provider, refresh.context), CatalogError);
    assert.notEqual(refresh.persisted, null);
    assert.deepEqual(refresh.persisted?.models, []);
    assert.deepEqual(ids(provider), []);
  });
});
