import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("ships the HEY capture interface", async () => {
  const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");

  assert.match(html, /<title>hey me\.<\/title>/i);
  assert.match(html, /<h1 id="page-title">hey me\.<\/h1>/i);
  assert.match(html, /<textarea[^>]+maxlength="10000"/i);
  assert.match(html, /send to hey →/i);
  assert.match(html, /<script src="\/app\.js" defer><\/script>/i);
});

test("ships an installable manifest and service worker", async () => {
  const [manifestText, worker] = await Promise.all([
    readFile(new URL("../public/manifest.webmanifest", import.meta.url), "utf8"),
    readFile(new URL("../public/sw.js", import.meta.url), "utf8"),
  ]);
  const manifest = JSON.parse(manifestText);

  assert.equal(manifest.name, "hey me.");
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.share_target.action, "/");
  assert.equal(manifest.icons.length, 2);
  assert.match(worker, /hey-me-v7/);
  assert.match(worker, /\/app\.js/);
  assert.match(worker, /\/styles\.css/);
});

test("gives an actionable message when the private server is unreachable", async () => {
  const source = await readFile(new URL("../public/app.js", import.meta.url), "utf8");

  assert.match(source, /Check that Tailscale is connected, then try again\./);
});
