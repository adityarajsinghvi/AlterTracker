// Wraps the OpenNext worker and serves static files from the bundle (no Workers static-assets binding needed).
import worker from "../.open-next/worker.js";
import files from "../.open-next/embedded-assets.js";

export { DOQueueHandler, DOShardedTagCache, BucketCachePurge } from "../.open-next/worker.js";

const decoded = new Map(); // decode each file once per worker instance, not on every request

function decode(b64) {
  const hit = decoded.get(b64);
  if (hit) return hit;
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  decoded.set(b64, out);
  return out;
}

function serve(request) {
  const url = new URL(request.url);
  const hit = files[decodeURIComponent(url.pathname)];
  if (!hit) return null;
  const immutable = url.pathname.startsWith("/_next/static/");
  return new Response(request.method === "HEAD" ? null : decode(hit[1]), {
    headers: {
      "Content-Type": hit[0],
      "Cache-Control": immutable ? "public, max-age=31536000, immutable" : url.pathname === "/sw.js" ? "no-cache" : "public, max-age=3600",
    },
  });
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === "GET" || request.method === "HEAD") {
      const res = serve(request);
      if (res) return res;
    }
    const shim = { fetch: (req) => Promise.resolve(serve(req instanceof Request ? req : new Request(req)) ?? new Response("Not found", { status: 404 })) };
    return worker.fetch(request, { ...env, ASSETS: shim }, ctx);
  },
};
