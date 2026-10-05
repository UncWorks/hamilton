// Same-origin proxy to the trust engine's HTTP API (/api/events,
// /api/missions/decision). The engine (axum) sends no CORS headers, so the
// browser cannot call http://localhost:8080 directly from :3000; this keeps
// the after-action log and branch logging working without an engine change.

import type { NextRequest } from 'next/server';

const ENGINE = process.env.ENGINE_HTTP_URL ?? 'http://localhost:8080';
const ALLOWED = new Set(['events', 'missions/decision']);

export const dynamic = 'force-dynamic';

async function forward(req: NextRequest, path: string[]): Promise<Response> {
  const sub = path.join('/');
  if (!ALLOWED.has(sub)) return new Response('not found', { status: 404 });
  const url = `${ENGINE}/api/${sub}${req.nextUrl.search}`;
  try {
    const init: RequestInit = {
      method: req.method,
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
    };
    if (req.method === 'POST') init.body = await req.text();
    const res = await fetch(url, init);
    return new Response(await res.text(), {
      status: res.status,
      headers: { 'Content-Type': res.headers.get('Content-Type') ?? 'application/json' },
    });
  } catch {
    return new Response(JSON.stringify({ error: 'engine unreachable' }), { status: 502 });
  }
}

export async function GET(req: NextRequest, { params }: { params: { path: string[] } }) {
  return forward(req, params.path);
}

export async function POST(req: NextRequest, { params }: { params: { path: string[] } }) {
  return forward(req, params.path);
}
