import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
  name: string;
  version: string;
  keywords?: string[];
  pi?: { extensions?: string[] };
  scripts?: Record<string, string>;
  files?: string[];
};

describe("package manifest", () => {
  it("uses the approved package name", () => {
    assert.equal(pkg.name, "pi-provider-vancine");
  });

  it("includes the pi-package keyword", () => {
    assert.ok(pkg.keywords?.includes("pi-package"));
  });

  it("points pi.extensions at the real TypeScript entry", () => {
    assert.deepEqual(pkg.pi?.extensions, ["./src/index.ts"]);
    readFileSync(join(root, "src/index.ts"), "utf8");
  });

  it("has no install lifecycle scripts", () => {
    const scripts = pkg.scripts ?? {};
    for (const name of ["preinstall", "install", "postinstall", "preuninstall", "uninstall", "postuninstall"]) {
      assert.equal(scripts[name], undefined, name);
    }
  });

  it("npm tarball does not include tests, logs, credentials, or temp files", () => {
    const result = spawnSync("npm", ["pack", "--dry-run", "--json"], {
      cwd: root,
      encoding: "utf8",
    });
    assert.equal(result.status, 0, result.stderr);
    const parsed = JSON.parse(result.stdout) as Array<{ filename: string; files: Array<{ path: string }> }>;
    const files = parsed[0]?.files.map((file) => file.path) ?? [];
    assert.ok(files.includes("src/index.ts"));
    assert.ok(files.includes("package.json"));
    for (const path of files) {
      assert.doesNotMatch(path, /(^|\/)test\//);
      assert.doesNotMatch(path, /\.(log|tgz|env)$/);
      assert.doesNotMatch(path, /(^|\/)node_modules\//);
      assert.doesNotMatch(path, /(^|\/)\.pi\//);
      assert.doesNotMatch(path, /credential|auth\.json|secret/i);
    }
  });
});
