import http from "node:http";

const PORT = process.env.PORT || 3008;

const server = http.createServer((req, res) => {
  const chunks = [];
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const timestamp = new Date().toISOString();

  // If there's a hub.challenge or challenge (Meta/WABA verification pattern)
  const challenge = url.searchParams.get("hub.challenge") || url.searchParams.get("challenge");

  req.on("data", (chunk) => chunks.push(chunk));
  req.on("end", () => {
    const rawBody = Buffer.concat(chunks).toString("utf8");
    let parsedBody = rawBody;

    try {
      if (rawBody.trim().startsWith("{") || rawBody.trim().startsWith("[")) {
        parsedBody = JSON.parse(rawBody);
      }
    } catch {
      // keep rawBody if not JSON
    }

    console.log("\n" + "=".repeat(60));
    console.log(`[${timestamp}] ${req.method} ${req.url}`);
    console.log("-".repeat(60));
    console.log("Headers:", JSON.stringify(req.headers, null, 2));

    if (rawBody) {
      console.log("-".repeat(60));
      console.log("Body:");
      if (typeof parsedBody === "object") {
        console.dir(parsedBody, { depth: null, colors: true });
      } else {
        console.log(parsedBody);
      }
    }
    console.log("=".repeat(60) + "\n");

    // Reply with challenge if verification request, else standard 200 OK
    if (challenge) {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end(challenge);
      return;
    }

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "received", timestamp }));
  });
});

server.listen(PORT, () => {
  console.log(`\n Telnyx / WABA Webhook Logger running on http://localhost:${PORT}`);
  console.log(` Ready to receive events via ngrok (e.g. ngrok http ${PORT})\n`);
});

