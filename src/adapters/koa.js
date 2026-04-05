/**
 * Koa adapter
 *
 * Usage:
 *   const Koa = require('koa');
 *   const { requestMiddleware } = require('blorq-logger/koa');
 *   const app = new Koa();
 *   app.use(requestMiddleware({ appName: 'my-api' }));
 */
'use strict';

const crypto = require('crypto');
const { state, enqueue } = require('../core');

function requestMiddleware(opts = {}) {
  const appName = opts.appName || state.cfg.appName;
  const skip    = opts.skipPaths || state.cfg.skipPaths;

  return async function blorqKoaMiddleware(ctx, next) {
    const rawPath = ctx.path;
    if (skip.some(p => rawPath.startsWith(p))) return next();

    const startHr   = process.hrtime.bigint();
    const requestId = ctx.headers['x-request-id'] || crypto.randomUUID();

    ctx.state.requestId = requestId;
    ctx.set('X-Request-Id', requestId);

    // Attach structured logger to context
    const Logger = require('../core').Logger;
    ctx.log = new Logger({ requestId });

    try {
      await next();
    } finally {
      const ms        = Math.round(Number(process.hrtime.bigint() - startHr) / 1e4) / 100;
      const status    = ctx.status;

      enqueue(JSON.stringify({
        ts:         new Date().toISOString(),
        level:      status >= 500 ? 'ERROR' : status >= 400 ? 'WARN' : 'INFO',
        appName:    appName + '-requests',
        type:       'api_request',
        requestId,
        method:     ctx.method,
        path:       rawPath,
        statusCode: status,
        durationMs: ms,
        message:    ctx.method + ' ' + rawPath + ' ' + status + ' ' + ms + 'ms',
      }));
    }
  };
}

module.exports = { requestMiddleware };
