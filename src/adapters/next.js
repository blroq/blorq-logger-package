/**
 * Next.js adapter
 *
 * Works for:
 *   - App Router (Next 13+) — middleware.js
 *   - Pages Router — API routes via withLogger()
 *   - Edge Runtime — uses global fetch (already available)
 */
'use strict';

const crypto = require('crypto');
const { state, enqueue } = require('../core');

// ── Pages Router (API routes) ─────────────────────────────────────────────
/**
 * Wraps a Next.js API route handler with request logging.
 *
 * Usage (pages/api/hello.js):
 *   const { withLogger } = require('blorq-logger/next');
 *   export default withLogger(async (req, res) => { res.json({ ok: true }); });
 *
 * Or use the root convenience shorthand:
 *   const logger = require('blorq-logger');
 *   export default logger.requestLogger({ framework:'next' })(handler);
 */
function withLogger(optsOrHandler, maybeOpts = {}) {
  // Support: withLogger(handler) or withLogger(opts)(handler)
  if (typeof optsOrHandler === 'function') {
    return _wrapHandler(optsOrHandler, maybeOpts);
  }
  const opts = optsOrHandler || {};
  return function (handler) { return _wrapHandler(handler, opts); };
}

function _wrapHandler(handler, opts = {}) {
  const appName = opts.appName || state.cfg.appName;
  const skip    = opts.skipPaths || state.cfg.skipPaths;

  return async function blorqNextHandler(req, res) {
    const rawPath = req.url ? req.url.split('?')[0] : '/';
    if (skip.some(p => rawPath.startsWith(p))) return handler(req, res);

    const startHr   = process.hrtime.bigint();
    const requestId = req.headers['x-request-id'] || crypto.randomUUID();
    req.requestId   = requestId;
    if (res.setHeader) res.setHeader('X-Request-Id', requestId);

    let status = 200;
    const origJson    = res.json?.bind(res);
    const origSend    = res.send?.bind(res);
    const origStatus  = res.status?.bind(res);

    if (origStatus) res.status = (code) => { status = code; return origStatus(code); };

    const origEnd = res.end?.bind(res);
    if (origEnd) {
      res.end = function (...args) {
        record();
        return origEnd(...args);
      };
    }

    let recorded = false;
    function record() {
      if (recorded) return;
      recorded = true;
      const ms = Math.round(Number(process.hrtime.bigint() - startHr) / 1e4) / 100;
      const sc = res.statusCode || status;
      enqueue(JSON.stringify({
        ts: new Date().toISOString(),
        level: sc >= 500 ? 'ERROR' : sc >= 400 ? 'WARN' : 'INFO',
        appName: appName + '-requests',
        type: 'api_request',
        requestId,
        method:     req.method,
        path:       rawPath,
        statusCode: sc,
        durationMs: ms,
        message:    req.method + ' ' + rawPath + ' ' + sc + ' ' + ms + 'ms',
      }));
    }

    try { await handler(req, res); } catch (err) { status = 500; record(); throw err; }
    record();
  };
}

// ── App Router (Next 13+ middleware.js) ───────────────────────────────────
/**
 * Usage in middleware.js:
 *   import { nextMiddleware } from 'blorq-logger/next';
 *   export default nextMiddleware();
 *   export const config = { matcher: '/api/:path*' };
 *
 * Note: Next middleware runs in the Edge Runtime.
 * This uses fetch (always available in Edge) and does NOT use Node.js built-ins.
 */
function nextMiddleware(opts = {}) {
  const appName = opts.appName || state.cfg.appName || 'app';
  const apiKey  = opts.apiKey  || state.cfg.apiKey  || '';
  const url     = opts.remoteUrl || state.cfg.remoteUrl;
  const skip    = opts.skipPaths || state.cfg.skipPaths || [];

  return async function blorqEdgeMiddleware(request, event) {
    const { NextResponse } = await import('next/server');
    const pathname = new URL(request.url).pathname;

    if (skip.some(p => pathname.startsWith(p))) return NextResponse.next();

    const start     = Date.now();
    const requestId = request.headers.get('x-request-id') || crypto.randomUUID();

    const response  = NextResponse.next();
    response.headers.set('X-Request-Id', requestId);

    const ms   = Date.now() - start;
    const entry = JSON.stringify({
      ts:         new Date().toISOString(),
      level:      'INFO',
      appName:    appName + '-requests',
      type:       'api_request',
      requestId,
      method:     request.method,
      path:       pathname,
      durationMs: ms,
      message:    request.method + ' ' + pathname + ' ' + ms + 'ms',
    });

    if (url) {
      // Fire-and-forget in Edge (no await — keeps it non-blocking)
      fetch(url, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', ...(apiKey ? { 'x-api-key': apiKey } : {}) },
        body:    JSON.stringify({ appName, logs: [entry] }),
      }).catch(() => {});
    }

    return response;
  };
}

module.exports = { withLogger, nextMiddleware };
