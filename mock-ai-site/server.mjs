import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLIC_DIR = path.join(__dirname, "public");

const HOST = "127.0.0.1";
const PORT = 4310;

/**
 * In-memory storage for received chat messages during automated test runs.
 * NOTE: Test-only buffer. Prompts are never written to disk or persistent storage.
 */
let receivedMessages = [];

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(JSON.stringify(data));
}

const server = http.createServer((req, res) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    res.end();
    return;
  }

  const url = new URL(req.url || "/", `http://${req.headers.host || `${HOST}:${PORT}`}`);
  const pathname = url.pathname;

  // 1. API Endpoint: Send Chat Message
  if (pathname === "/api/chat" && req.method === "POST") {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      try {
        const parsed = JSON.parse(body || "{}");
        const messageText = typeof parsed.message === "string" ? parsed.message : "";
        receivedMessages.push({
          message: messageText,
          timestamp: new Date().toISOString(),
          transport: req.headers["x-test-transport"],
        });

        sendJson(res, 200, {
          reply: `Mock AI received ${messageText.length} characters.`,
          receivedCount: receivedMessages.length,
        });
      } catch {
        sendJson(res, 400, { error: "Invalid JSON body" });
      }
    });
    return;
  }

  // 2. Test-Only Endpoint: Inspect Received Messages
  if (pathname === "/__test/received" && req.method === "GET") {
    sendJson(res, 200, {
      count: receivedMessages.length,
      messages: receivedMessages,
    });
    return;
  }

  // 3. Test-Only Endpoint: Reset In-Memory Buffer
  if (pathname === "/__test/reset" && req.method === "POST") {
    receivedMessages = [];
    sendJson(res, 200, { status: "reset", count: 0 });
    return;
  }

  // 4. Static Files Server (public/)
  let filePath = path.join(PUBLIC_DIR, pathname === "/" ? "index.html" : pathname);
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not Found");
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes = {
      ".html": "text/html; charset=utf-8",
      ".js": "application/javascript; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".json": "application/json",
    };

    res.writeHead(200, { "Content-Type": mimeTypes[ext] || "application/octet-stream" });
    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen(PORT, HOST, () => {
  console.log(`[Mock AI Site] Listening on http://${HOST}:${PORT}`);
});
