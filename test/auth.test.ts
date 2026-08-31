import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loginWithApiKey, resolveApiKey, API_KEY_AUTH_NAME } from "../src/auth.ts";
import { errorMessage, redactSecret } from "../src/errors.ts";
import { FAKE_KEY } from "./helpers.ts";

describe("API-key auth", () => {
  it("login uses a secret prompt and returns the current credential shape", async () => {
    const prompts: unknown[] = [];
    const credential = await loginWithApiKey({
      signal: new AbortController().signal,
      prompt: async (prompt) => {
        prompts.push(prompt);
        return `  ${FAKE_KEY}  `;
      },
      notify: () => {},
    });
    assert.deepEqual(prompts, [
      { type: "secret", message: "Vancine API key", placeholder: "sk-..." },
    ]);
    assert.deepEqual(credential, { type: "api_key", key: FAKE_KEY });
    assert.equal(API_KEY_AUTH_NAME, "Vancine API key");
  });

  it("login rejects a blank key without echoing any secret", async () => {
    await assert.rejects(
      () =>
        loginWithApiKey({
          signal: new AbortController().signal,
          prompt: async () => "   ",
          notify: () => {},
        }),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.equal(error.message, "A Vancine API key is required");
        assert.doesNotMatch(error.message, /sk-/);
        return true;
      },
    );
  });

  it("resolve returns bearer auth only when a stored credential exists", async () => {
    const resolved = await resolveApiKey({ credential: { type: "api_key", key: FAKE_KEY } });
    assert.deepEqual(resolved, { auth: { apiKey: FAKE_KEY }, source: "stored API key" });
  });

  it("resolve does not invent auth without a credential", async () => {
    assert.equal(await resolveApiKey({}), undefined);
    assert.equal(await resolveApiKey({ credential: { type: "api_key" } }), undefined);
    assert.equal(await resolveApiKey({ credential: { type: "api_key", key: "   " } }), undefined);
  });

  it("errors and logs never include the full key", () => {
    const leaked = `upstream failed for ${FAKE_KEY}`;
    assert.equal(redactSecret(leaked, FAKE_KEY), "upstream failed for [redacted]");
    assert.equal(errorMessage(new Error(leaked), FAKE_KEY), "upstream failed for [redacted]");
    assert.doesNotMatch(errorMessage(new Error(leaked), FAKE_KEY), new RegExp(FAKE_KEY));
  });
});
