import assert from "node:assert/strict";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

const port = 20_000 + (process.pid % 10_000);
const origin = "https://hey-me.example.ts.net";

test("Hey Me bridge", async (context) => {
  const testDirectory = await mkdtemp(path.join(tmpdir(), "hey-me-test-"));
  const fakeHey = path.join(testDirectory, "hey.mjs");
  const captureOutput = path.join(testDirectory, "capture.json");
  await writeFile(fakeHey, `#!/usr/bin/env node
import { writeFile } from "node:fs/promises";
let input = "";
for await (const chunk of process.stdin) input += chunk;
await writeFile(process.env.HEY_TEST_OUTPUT, JSON.stringify({ args: process.argv.slice(2), input }));
console.log('{"ok":true}');
`);
  await chmod(fakeHey, 0o700);

  Object.assign(process.env, {
    CAPTURE_PORT: String(port),
    CAPTURE_ALLOWED_ORIGIN: origin,
    HEY_BINARY: fakeHey,
    HEY_ACCOUNT_ID: "123456",
    HEY_CAPTURE_ADDRESS: "me@example.com",
    HEY_TEST_OUTPUT: captureOutput,
  });

  const { server } = await import("../bridge/server.mjs");
  if (!server.listening) {
    await new Promise((resolve) => server.once("listening", resolve));
  }

  try {
    await context.test("accepts a private same-origin capture", async () => {
      const response = await fetch(`http://127.0.0.1:${port}/api/capture`, {
        method: "POST",
        headers: { "content-type": "application/json", origin },
        body: JSON.stringify({ text: "server test" }),
      });

      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { ok: true, message: "Saved to HEY" });

      const capture = JSON.parse(await readFile(captureOutput, "utf8"));
      assert.deepEqual(capture.args, [
        "--account", "123456", "compose", "--to", "me@example.com", "--subject", "idea", "--json",
      ]);
      assert.equal(capture.input, "server test");
    });

    await context.test("serves the static app", async () => {
      const response = await fetch(`http://127.0.0.1:${port}/?text=shared`);
      const html = await response.text();

      assert.equal(response.status, 200);
      assert.match(response.headers.get("content-type"), /^text\/html/);
      assert.match(html, /<h1 id="page-title">hey me\.<\/h1>/i);
    });

    await context.test("rejects a cross-origin capture", async () => {
      const response = await fetch(`http://127.0.0.1:${port}/api/capture`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://example.com",
          "sec-fetch-site": "cross-site",
        },
        body: JSON.stringify({ text: "blocked" }),
      });

      assert.equal(response.status, 403);
    });
  } finally {
    server.closeAllConnections();
    await new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
    await rm(testDirectory, { recursive: true, force: true });
  }
});
