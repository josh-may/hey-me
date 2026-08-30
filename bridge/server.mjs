import http from "node:http";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const port = Number.parseInt(process.env.CAPTURE_PORT || "4327", 10);
const host = process.env.CAPTURE_HOST || "127.0.0.1";
const allowedOrigin = process.env.CAPTURE_ALLOWED_ORIGIN || "";
const heyBinary = process.env.HEY_BINARY || path.join(os.homedir(), ".local", "bin", "hey");
const heyAccount = process.env.HEY_ACCOUNT_ID || "";
const heyAddress = process.env.HEY_CAPTURE_ADDRESS || "";
const dryRun = process.env.HEY_CAPTURE_DRY_RUN === "1";
const publicDirectory = fileURLToPath(new URL("../public/", import.meta.url));

const staticFiles = new Map([
  ["/", ["index.html", "text/html; charset=utf-8"]],
  ["/app.js", ["app.js", "text/javascript; charset=utf-8"]],
  ["/styles.css", ["styles.css", "text/css; charset=utf-8"]],
  ["/manifest.webmanifest", ["manifest.webmanifest", "application/manifest+json"]],
  ["/sw.js", ["sw.js", "text/javascript; charset=utf-8"]],
  ["/favicon.png", ["favicon.png", "image/png"]],
  ["/icon-192.png", ["icon-192.png", "image/png"]],
  ["/icon-512.png", ["icon-512.png", "image/png"]],
]);

function logCapture(requestId, outcome, startedAt, detail = "") {
  const durationMs = Date.now() - startedAt;
  const suffix = detail ? ` detail=${JSON.stringify(detail)}` : "";
  console.log(
    `capture request_id=${requestId} outcome=${outcome} duration_ms=${durationMs}${suffix}`,
  );
}

function json(response, status, payload) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
    "x-frame-options": "DENY",
  });
  response.end(JSON.stringify(payload));
}

function isAllowedMutation(request) {
  if (request.headers["sec-fetch-site"] === "cross-site") return false;
  if (!allowedOrigin) return true;

  const origin = request.headers.origin;
  return !origin || origin === allowedOrigin;
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 12_000) {
        reject(new Error("Capture is too long."));
        request.destroy();
      }
    });
    request.on("end", () => {
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error("Capture must be valid JSON."));
      }
    });
    request.on("error", reject);
  });
}

function sendToHey(text) {
  if (dryRun) return Promise.resolve();
  if (!heyAccount || !heyAddress) {
    return Promise.reject(
      new Error("Set HEY_ACCOUNT_ID and HEY_CAPTURE_ADDRESS before capturing."),
    );
  }

  return new Promise((resolve, reject) => {
    const child = spawn(
      heyBinary,
      [
        "--account",
        heyAccount,
        "compose",
        "--to",
        heyAddress,
        "--subject",
        "idea",
        "--json",
      ],
      { stdio: ["pipe", "pipe", "pipe"] },
    );

    let output = "";
    let errorOutput = "";
    child.stdout.on("data", (chunk) => { output += chunk; });
    child.stderr.on("data", (chunk) => { errorOutput += chunk; });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      let detail = errorOutput.trim();
      try {
        const parsed = JSON.parse(output);
        detail = parsed.error || parsed.message || detail;
      } catch {
        // Keep the concise stderr message when output is not JSON.
      }
      reject(new Error(detail || "HEY could not send the message."));
    });

    child.stdin.end(text);
  });
}

async function serveStatic(request, response, pathname) {
  const file = staticFiles.get(pathname);
  if (!file || (request.method !== "GET" && request.method !== "HEAD")) {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found.");
    return;
  }

  try {
    const body = await readFile(path.join(publicDirectory, file[0]));
    response.writeHead(200, {
      "content-type": file[1],
      "cache-control": pathname === "/sw.js" ? "no-cache" : "public, max-age=300",
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer",
      "x-frame-options": "DENY",
    });
    response.end(request.method === "HEAD" ? undefined : body);
  } catch {
    response.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
    response.end("Could not load Hey Me.");
  }
}

export const server = http.createServer(async (request, response) => {
  const pathname = new URL(request.url || "/", "http://localhost").pathname;

  if (pathname === "/health") {
    json(response, 200, { ok: true });
    return;
  }

  if (pathname === "/api/capture") {
    const requestId = crypto.randomUUID();
    const startedAt = Date.now();

    if (request.method !== "POST") {
      logCapture(requestId, "method_not_allowed", startedAt);
      json(response, 405, { message: "Method not allowed." });
      return;
    }

    if (!isAllowedMutation(request)) {
      logCapture(requestId, "forbidden", startedAt);
      json(response, 403, { message: "Forbidden." });
      return;
    }

    if (!request.headers["content-type"]?.startsWith("application/json")) {
      logCapture(requestId, "unsupported_media_type", startedAt);
      json(response, 415, { message: "Expected JSON." });
      return;
    }

    try {
      const payload = await readJson(request);
      const text = typeof payload?.text === "string" ? payload.text.trim() : "";
      if (!text) {
        logCapture(requestId, "empty", startedAt);
        json(response, 400, { message: "Write something first." });
        return;
      }
      if (text.length > 10_000) {
        logCapture(requestId, "too_long", startedAt);
        json(response, 413, { message: "Keep captures under 10,000 characters." });
        return;
      }

      await sendToHey(text);
      logCapture(requestId, "sent", startedAt);
      json(response, 200, { ok: true, message: "Saved to HEY" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      logCapture(requestId, "failed", startedAt, message);
      json(response, 502, {
        message: error instanceof Error ? error.message : "Could not send your idea.",
      });
    }
    return;
  }

  await serveStatic(request, response, pathname);
});

server.listen(port, host, () => {
  console.log(`Hey Me bridge listening on http://${host}:${port}`);
});
