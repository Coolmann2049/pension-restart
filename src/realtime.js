import { EventEmitter } from "node:events";

const bus = new EventEmitter();
bus.setMaxListeners(100);

export function publish(type, payload) {
  const event = { type, at: new Date().toISOString(), payload };
  bus.emit("event", event);
  return event;
}

export function subscribe(response) {
  response.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  response.write(`event: ready\ndata: ${JSON.stringify({ at: new Date().toISOString() })}\n\n`);
  const listener = event => response.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
  bus.on("event", listener);
  const heartbeat = setInterval(() => response.write(": heartbeat\n\n"), 20_000);
  response.on("close", () => {
    clearInterval(heartbeat);
    bus.off("event", listener);
  });
}
