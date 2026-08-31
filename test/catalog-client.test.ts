import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fetchVancineCatalog, httpDateFromTimestamp } from "../src/catalog-client.ts";
import { CatalogError } from "../src/errors.ts";
import { jsonResponse } from "./helpers.ts";

describe("catalog client", () => {
  it("refuses non-vancine.com catalog URLs so credentials cannot leak", async () => {
    await assert.rejects(
      () =>
        fetchVancineCatalog({
          url: "https://models.dev/api.json",
          signal: new AbortController().signal,
          transport: async () => jsonResponse({}),
        }),
      (error: unknown) => {
        assert.ok(error instanceof CatalogError);
        assert.equal(error.code, "redirect");
        return true;
      },
    );
  });

  it("does not attach Authorization and honors 304", async () => {
    let headers: Record<string, string> | undefined;
    const result = await fetchVancineCatalog({
      url: "https://vancine.com/api/pi/catalog",
      etag: '"abc"',
      lastModifiedHttp: "Mon, 31 Aug 2026 08:00:34 GMT",
      signal: new AbortController().signal,
      transport: async (_url, init) => {
        headers = init.headers;
        return new Response(null, {
          status: 304,
          headers: { etag: '"abc"', "last-modified": "Mon, 31 Aug 2026 08:00:34 GMT" },
        });
      },
    });
    assert.equal(result.status, "not_modified");
    assert.equal(headers?.Authorization, undefined);
    assert.equal(headers?.["If-None-Match"], '"abc"');
    assert.equal(headers?.["If-Modified-Since"], "Mon, 31 Aug 2026 08:00:34 GMT");
    if (result.status === "not_modified") {
      assert.equal(result.lastModified, Date.parse("Mon, 31 Aug 2026 08:00:34 GMT"));
    }
  });

  it("converts valid unix-ms timestamps to RFC 1123 and drops invalid times", () => {
    assert.equal(httpDateFromTimestamp(Date.parse("Mon, 31 Aug 2026 08:00:34 GMT")), "Mon, 31 Aug 2026 08:00:34 GMT");
    assert.equal(httpDateFromTimestamp(0), undefined);
    assert.equal(httpDateFromTimestamp(-1), undefined);
    assert.equal(httpDateFromTimestamp(Number.NaN), undefined);
    assert.equal(httpDateFromTimestamp(undefined), undefined);
  });
});
