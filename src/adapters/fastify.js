/**
 * Fastify adapter — registers as a Fastify plugin
 *
 * Usage:
 *   const fastify = require('fastify')();
 *   await fastify.register(require('blorq-logger/fastify'), {
 *     appName: 'my-api',
 *     remoteUrl: 'http://blorq:9900/api/logs',
 *     apiKey: 'blq_...',
 *   });
 */
'use strict';

const crypto = require('crypto');
const { state, enqueue } = require('../core');

function plugin(opts = {}) {
  const appName = opts.appName || state.cfg.appName;
  const skip    = opts.skipPaths || state.cfg.skipPaths;

  // fastify-plugin style (no encapsulation)
  async function blorqPlugin(fastify, options) {
    fastify.addHook('onRequest', async (request, reply) => {
      const rawPath = request.routerPath || request.url.split('?')[0];
      if (skip.some(p => rawPath.startsWith(p))) return;

      request.blorqStart     = process.hrtime.bigint();
      request.blorqRequestId = request.headers['x-request-id'] || crypto.randomUUID();
      reply.header('X-Request-Id', request.blorqRequestId);
    });

    fastify.addHook('onResponse', async (request, reply) => {
      if (!request.blorqStart) return;

      const ms        = Math.round(Number(process.hrtime.bigint() - request.blorqStart) / 1e4) / 100;
      const status    = reply.statusCode;
      const routePath = request.routerPath || request.url.split('?')[0];

      enqueue(JSON.stringify({
        ts:         new Date().toISOString(),
        level:      status >= 500 ? 'ERROR' : status >= 400 ? 'WARN' : 'INFO',
        appName:    appName + '-requests',
        type:       'api_request',
        requestId:  request.blorqRequestId,
        method:     request.method,
        path:       routePath,
        statusCode: status,
        durationMs: ms,
        message:    request.method + ' ' + routePath + ' ' + status + ' ' + ms + 'ms',
      }));
    });

    // Attach a structured logger to every request
    fastify.decorateRequest('log', null);
    fastify.addHook('onRequest', async (request) => {
      const Logger = require('../core').Logger;
      request.log = new Logger({ requestId: request.blorqRequestId });
    });
  }

  // Mark as fastify-plugin so it doesn't create a new scope
  blorqPlugin[Symbol.for('skip-override')] = true;
  return blorqPlugin;
}

module.exports = { plugin };
