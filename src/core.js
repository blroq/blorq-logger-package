/**
 * blorq-logger — core engine
 * Zero external dependencies. Works in any Node.js >=18 environment.
 */
'use strict';

const os     = require('os');
const crypto = require('crypto');

// ── Default config ────────────────────────────────────────────────────────
const DEFAULT_CFG = {
  appName:          process.env.BLORQ_APP_NAME     || process.env.APP_NAME   || 'app',
  remoteUrl:        process.env.BLORQ_URL          || process.env.LOG_REMOTE_URL || null,
  apiKey:           process.env.BLORQ_API_KEY      || process.env.LOG_API_KEY    || '',
  level:            process.env.BLORQ_LEVEL        || process.env.LOG_LEVEL      || 'info',
  prettyPrint:      true,              // pretty-print JSON (with newlines + indentation)
  stdout:           false,             // also write to stdout (besides sending remote)
  bufferSize:       50,                // flush when buffer reaches this
  flushIntervalMs:  200,               // flush every N ms
  remoteTimeoutMs:  3000,
  remoteRetries:    2,
  retryDelayMs:     300,
  // Console interception (set via configure({ interceptConsole:true }))
  interceptConsole: process.env.BLORQ_INTERCEPT === 'true',
  // Paths skipped by requestLogger()
  skipPaths: (process.env.BLORQ_SKIP_PATHS || '/health,/ping,/favicon,/_next/static')
    .split(',').map(s => s.trim()).filter(Boolean),
};

// ── Level ordering ────────────────────────────────────────────────────────
const LEVELS = { silent:0, debug:10, info:20, warn:30, error:40, fatal:50 };

// ── Sensitive keys masked in JSON output ───────────────────────────────────
const MASK_KEYS = new Set(['authorization','token','password','secret','apikey','key','auth','passwd','credential','cookie','x-api-key']);

// ── Shared mutable state (module singleton) ────────────────────────────────
const state = {
  cfg:            { ...DEFAULT_CFG },
  buffer:         [],
  flushTimer:     null,
  flushPromise:   null,
  consoleInstalled: false,
  origConsole:    null,
};

// ── Helpers ────────────────────────────────────────────────────────────────

function levelNum(l) { return LEVELS[String(l).toLowerCase()] ?? LEVELS.info; }
function shouldLog(l) { return levelNum(l) >= levelNum(state.cfg.level); }

function safeStringify(obj) {
  const seen = new WeakSet();
  return JSON.stringify(obj, (key, val) => {
    if (typeof val === 'object' && val !== null) {
      if (seen.has(val)) return '[Circular]';
      seen.add(val);
    }
    if (key && MASK_KEYS.has(key.toLowerCase())) return '***';
    return val;
  });
}

function serializeExtras(extras) {
  return (extras || []).map(x => {
    if (x instanceof Error) return { error: x.message, stack: x.stack };
    return x;
  });
}

function buildEntry(level, appName, context, message, extras) {
  const payload = {
    ts:      new Date().toISOString(),
    level:   level.toUpperCase(),
    appName: appName || state.cfg.appName,
    host:    os.hostname(),
    pid:     process.pid,
    ...context,
    message: String(message == null ? '' : message),
  };
  const ex = serializeExtras(extras);
  if (ex.length) payload.data = ex;
  return state.cfg.prettyPrint ? JSON.stringify(payload, null, 2) : safeStringify(payload);
}

// ── Buffer + flush ────────────────────────────────────────────────────────

function enqueue(line) {
  state.buffer.push(line);
  if (state.buffer.length >= state.cfg.bufferSize) { flush(); return; }
  if (!state.flushTimer) {
    state.flushTimer = setTimeout(() => { state.flushTimer = null; flush(); }, state.cfg.flushIntervalMs);
    if (state.flushTimer.unref) state.flushTimer.unref();
  }
}

function flush() {
  if (state.flushPromise) {
    state.flushPromise = state.flushPromise.then(() => drain());
    return;
  }
  state.flushPromise = drain().finally(() => { state.flushPromise = null; });
}

async function drain() {
  return new Promise(resolve => setImmediate(async () => {
    const logs = state.buffer.splice(0);
    if (!logs.length) { resolve(); return; }

    // Local stdout
    if (state.cfg.stdout) {
      for (const l of logs) try { process.stdout.write(l + '\n'); } catch {}
    }

    // Remote ship
    if (state.cfg.remoteUrl) await sendBatch(logs).catch(() => {});
    resolve();
  }));
}

async function sendBatch(logs) {
  const { remoteUrl, apiKey, appName, remoteTimeoutMs, remoteRetries, retryDelayMs } = state.cfg;
  let attempt = 0;
  while (attempt < remoteRetries + 1) {
    try {
      const res = await fetch(remoteUrl, {
        method:  'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey ? { 'x-api-key': apiKey } : {}),
        },
        body:   JSON.stringify({ appName, logs }),
        signal: AbortSignal.timeout(remoteTimeoutMs),
      });
      if (res.ok) return;
      throw new Error('HTTP ' + res.status);
    } catch {
      attempt++;
      if (attempt > remoteRetries) return;
      await new Promise(r => setTimeout(r, retryDelayMs * Math.pow(2, attempt - 1)));
    }
  }
}

// ── Logger class ──────────────────────────────────────────────────────────

class Logger {
  /**
   * @param {object} context – Extra fields merged into every log entry
   */
  constructor(context = {}) {
    this._ctx     = context;
    this._appName = context.appName || null;
  }

  /** Create a child logger that inherits context + merges extra fields */
  child(extra = {}) {
    return new Logger({ ...this._ctx, ...extra });
  }

  /** Attach extra context to this logger (mutates) */
  with(extra = {}) {
    Object.assign(this._ctx, extra);
    return this;
  }

  _log(level, message, params) {
    if (!shouldLog(level)) return;
    enqueue(buildEntry(level, this._appName, this._ctx, message, params));
  }

  debug(msg, ...p) { this._log('debug', msg, p.length ? p : undefined); }
  info (msg, ...p) { this._log('info',  msg, p.length ? p : undefined); }
  warn (msg, ...p) { this._log('warn',  msg, p.length ? p : undefined); }
  error(msg, ...p) { this._log('error', msg, p.length ? p : undefined); }

  /** Fatal: bypasses buffer, ships immediately (for crash handlers) */
  fatal(msg, ...p) {
    if (!shouldLog('fatal')) return;
    const line = buildEntry('fatal', this._appName, this._ctx, msg, p.length ? p : undefined);
    try { process.stderr.write(line + '\n'); } catch {}
    if (state.cfg.remoteUrl) sendBatch([line]).catch(() => {});
  }

  /** Flush any buffered logs right now (useful before process.exit) */
  flush() { return drain(); }
}

// ── Exports ───────────────────────────────────────────────────────────────

module.exports = { Logger, state, LEVELS, enqueue, buildEntry, flush, drain, shouldLog, safeStringify };
