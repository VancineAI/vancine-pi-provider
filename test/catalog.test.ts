import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CatalogError } from "../src/errors.ts";
import { convertVancineCatalog, parseVancineCatalog } from "../src/catalog.ts";
import { catalog, chatModel } from "./helpers.ts";

describe("catalog conversion", () => {
  it("converts a valid chat catalog", () => {
    const result = convertVancineCatalog(
      catalog([
        chatModel({
          id: "hy4-preview",
          name: "Hy4 preview",
          reasoning: true,
          contextWindow: 1024000,
          maxTokens: 64000,
          cost: { input: 0.67, output: 2, cacheRead: 0.034, cacheWrite: 0 },
        }),
      ]),
    );
    assert.equal(result.models.length, 1);
    assert.equal(result.models[0]?.id, "hy4-preview");
    assert.equal(result.models[0]?.compat?.supportsDeveloperRole, false);
    assert.equal(result.skipped.length, 0);
  });

  it("keeps text models and vision-language models with image input", () => {
    const result = convertVancineCatalog(
      catalog([
        chatModel({ id: "text-only", input: ["text"] }),
        chatModel({ id: "vision", input: ["text", "image", "video"] }),
      ]),
    );
    assert.deepEqual(
      result.models.map((model) => [model.id, model.input]),
      [
        ["text-only", ["text"]],
        ["vision", ["text", "image"]],
      ],
    );
  });

  it("filters disabled, unavailable, non-chat, and media-generation models", () => {
    const result = convertVancineCatalog(
      catalog([
        chatModel({ id: "ok" }),
        chatModel({ id: "off", enabled: false }),
        chatModel({ id: "down", available: false }),
        chatModel({ id: "pic", kind: "image" }),
        chatModel({ id: "vid", kind: "video" }),
        chatModel({ id: "tts", kind: "tts" }),
        chatModel({ id: "audio", kind: "audio" }),
        chatModel({ id: "mesh", kind: "3d" }),
        chatModel({ id: "emb", kind: "embedding" }),
        chatModel({ id: "rr", kind: "rerank" }),
        chatModel({ id: "async", kind: "task" }),
        chatModel({ id: "image-api", api: "openai-images" }),
        chatModel({ id: "no-text", input: ["image"] }),
      ]),
    );
    assert.deepEqual(
      result.models.map((model) => model.id),
      ["ok"],
    );
    const skippedIds = result.skipped.map((item) => item.id);
    assert.deepEqual(skippedIds.sort(), [
      "async",
      "audio",
      "down",
      "emb",
      "image-api",
      "mesh",
      "no-text",
      "off",
      "pic",
      "rr",
      "tts",
      "vid",
    ]);
  });

  it("keeps the first duplicate id and does not emit two models with the same id", () => {
    const result = convertVancineCatalog(
      catalog([
        chatModel({ id: "dup", name: "First", contextWindow: 1000, maxTokens: 10 }),
        chatModel({ id: "dup", name: "Second", contextWindow: 2000, maxTokens: 20 }),
      ]),
    );
    assert.equal(result.models.length, 1);
    assert.equal(result.models[0]?.name, "First");
    assert.equal(result.models[0]?.contextWindow, 1000);
    assert.deepEqual(result.skipped, [{ id: "dup", reason: "duplicate id; first occurrence kept" }]);
  });

  it("rejects invalid or incomplete catalogs instead of inventing models", () => {
    assert.throws(() => parseVancineCatalog(null), CatalogError);
    assert.throws(() => parseVancineCatalog({ success: true, data: [] }), /looks like \/api\/pricing/);
    assert.throws(
      () =>
        parseVancineCatalog({
          provider: "vancine",
          schemaVersion: 1,
          models: [{ id: "x" }],
        }),
      /must be a non-empty string/,
    );
    assert.throws(
      () =>
        convertVancineCatalog({
          provider: "vancine",
          schemaVersion: 1,
          models: [
            {
              id: "x",
              name: "X",
              enabled: true,
              available: true,
              kind: "chat",
              api: "openai-completions",
              input: ["text"],
              reasoning: true,
              contextWindow: 128000,
              maxTokens: 8192,
            },
          ],
        }),
      /cost/,
    );
  });
});
