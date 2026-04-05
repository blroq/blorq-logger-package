/**
 * blorq-logger — main entry point
 *
 * Framework-agnostic. For framework-specific helpers use the adapters:
 *   require('blorq-logger/express')
 *   require('blorq-logger/next')
 *   require('blorq-logger/fastify')
 *   require('blorq-logger/koa')
 */
'use strict';

const { Logger, state, flush, drain, shouldLog, safeStringify } = require('./core');
const crypto = require('crypto');

// ── Root singleton logger ─────────────────────────────────────────────────
const root = new Logger();

// ─────────────────────────────────────────────────────────────────────────
// configure({ appName, remoteUrl, apiKey, level, ... })
// Call once at startup before any logging.
// ─────────────────────────────────────────────────────────────────────────
root.configure = function configure(opts = {}) {
  Object.assign(state.cfg, opts);
  if (opts.interceptConsole) _installConsole();
};

// ─────────────────────────────────────────────────────────────────────────
// create(context) — factory for child loggers
// ─────────────────────────────────────────────────────────────────────────
root.create = function create(context = {}) {
  return new Logger(context);
};

// ─────────────────────────────────────────────────────────────────────────
// install() — Patch global console.* to also ship to Blorq
// All existing console.log/warn/error calls continue printing to terminal.
// ─────────────────────────────────────────────────────────────────────────
root.install = function install() { _installConsole(); };
root.uninstall = function uninstall() { _uninstallConsole(); };

// ─────────────────────────────────────────────────────────────────────────
// console — a console-compatible object you can use as a drop-in replacement
//   const console = require('blorq-logger').console;
// ─────────────────────────────────────────────────────────────────────────
root.console = {
  log:   (...a) => root.info(...a),
  info:  (...a) => root.info(...a),
  warn:  (...a) => root.warn(...a),
  error: (...a) => root.error(...a),
  debug: (...a) => root.debug(...a),
};

// ─────────────────────────────────────────────────────────────────────────
// requestLogger() — generic request logger middleware factory
// Returns the right middleware for the detected / specified framework.
//
//   app.use(logger.requestLogger())                // auto-detect
//   app.use(logger.requestLogger({ framework:'express' }))
// ─────────────────────────────────────────────────────────────────────────
root.requestLogger = function requestLogger(opts = {}) {
  const framework = opts.framework || _detectFramework();

  switch (framework) {
    case 'koa':
      return require('./adapters/koa').requestMiddleware(opts);
    case 'fastify':
      // Fastify uses plugins — this returns a plugin function
      return require('./adapters/fastify').plugin(opts);
    case 'next':
      // For Next.js API routes, returns a wrapper function, not middleware
      return require('./adapters/next').withLogger(opts);
    default:
      // Express / NestJS / Connect / plain http — returns (req, res, next)
      return require('./adapters/express').requestMiddleware(opts);
  }
};

// Convenience: generate a request ID
root.requestId = function () { return crypto.randomUUID(); };

// ── Auto-flush & shutdown ─────────────────────────────────────────────────
if (process.env.BLORQ_NO_AUTOSHUTDOWN !== 'true') {
  process.on('beforeExit',       () => drain());
  process.on('exit',             () => { /* sync flush not possible */ });
  process.on('SIGINT',  async () => { await drain(); process.exit(0); });
  process.on('SIGTERM', async () => { await drain(); process.exit(0); });
  process.on('uncaughtException', async (err) => {
    root.fatal('Uncaught exception', err);
    await drain();
    process.exit(1);
  });
  process.on('unhandledRejection', async (r) => {
    root.error('Unhandled rejection', r);
  });
}

// Auto-install if env var set
if (state.cfg.interceptConsole) _installConsole();

// ── Console interception (private) ────────────────────────────────────────

function _installConsole() {
  if (state.consoleInstalled) return;
  state.consoleInstalled = true;
  state.origConsole = {
    log:   console.log.bind(console),
    info:  console.info.bind(console),
    warn:  console.warn.bind(console),
    error: console.error.bind(console),
    debug: console.debug.bind(console),
  };

  const make = (level, orig) => function (...args) {
    orig(...args);  // always preserve terminal output
    if (!shouldLog(level)) return;
    const msg = args.map(a => typeof a === 'string' ? a : safeStringify(a)).join(' ');
    const { enqueue: eq, buildEntry: be } = require('./core');
    eq(be(level, state.cfg.appName, {}, msg, []));
  };

  console.log   = make('info',  state.origConsole.log);
  console.info  = make('info',  state.origConsole.info);
  console.warn  = make('warn',  state.origConsole.warn);
  console.error = make('error', state.origConsole.error);
  console.debug = make('debug', state.origConsole.debug);
}

function _uninstallConsole() {
  if (!state.consoleInstalled || !state.origConsole) return;
  Object.assign(console, state.origConsole);
  state.consoleInstalled = false;
}

function _detectFramework() {
  // Check if we're in a Next.js environment
  if (process.env.NEXT_RUNTIME || process.env.__NEXT_PRIVATE_RENDER_WORKER) return 'next';
  // Otherwise assume Express/Connect
  return 'express';
}

module.exports = root;
