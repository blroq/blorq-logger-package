/**
 * Express / Connect / NestJS / plain http adapter
 * Works with any Connect-compatible framework.
 */
'use strict';

const crypto = require('crypto');
const { state, enqueue, buildEntry } = require('../core');

/**
 * Returns Express-compatible middleware: (req, res, next) => void
 *
 * Options:
 *   appName     – override default appName for request logs
 *   skipPaths   – override default skip paths
 *   logBody     – include request body (careful: reads stream, default false)
 */
function requestMiddleware(opts = {}) {
  const appName  = opts.appName  || state.cfg.appName;
  const skip     = opts.skipPaths || state.cfg.skipPaths;

  return function blorqRequestLogger(req, res, next) {
    const rawPath = req.path || (req.url || '/').split('?')[0];

    if (skip.some(p => rawPath.startsWith(p))) return next();

    const startHr   = process.hrtime.bigint();
    const requestId = req.headers['x-request-id'] || crypto.randomUUID();
    const reqSize   = parseInt(req.headers['content-length'] || '0', 10) || 0;

    // Attach to request so route handlers can reference it
    req.requestId = requestId;
    req.blorqLogger = require('..').create({ requestId });
    res.setHeader('X-Request-Id', requestId);

    let recorded = false;
    function record() {
      if (recorded) return;
      recorded = true;

      const ms        = Math.round(Number(process.hrtime.bigint() - startHr) / 1e4) / 100;
      const status    = res.statusCode;
      const routePath = req.route
        ? (req.baseUrl || '') + req.route.path
        : rawPath;
      const resSize   = parseInt(res.getHeader('content-length') || '0', 10) || 0;
      const level     = status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info';

      const entry = JSON.stringify({
        ts:           new Date().toISOString(),
        level:        level.toUpperCase(),
        appName:      appName + '-requests',
        type:         'api_request',
        requestId,
        method:       req.method,
        path:         routePath,
        statusCode:   status,
        durationMs:   ms,
        reqSizeBytes: reqSize,
        resSizeBytes: resSize,
        userAgent:    req.headers['user-agent'] || '',
        message:      req.method + ' ' + routePath + ' ' + status + ' ' + ms + 'ms',
      });

      enqueue(entry);
    }

    res.once('finish', record);
    res.once('close',  record);
    next();
  };
}

module.exports = { requestMiddleware };
