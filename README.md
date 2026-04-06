<div align="center">
  <img src="https://raw.githubusercontent.com/blroq/blorq-cli/main/views/logo.png" alt="Blorq" height="72"/>
  <h1>blorq-logger</h1>
  <p><strong>Zero-dependency structured logger for Node.js ≥ 18.</strong><br/>Ships logs to <a href="https://www.npmjs.com/package/blorq">Blorq</a> or any compatible HTTP endpoint.</p>

  <a href="https://www.npmjs.com/package/blorq-logger"><img src="https://img.shields.io/npm/v/blorq-logger?color=blue&label=npm" alt="npm version"/></a>
  <a href="https://www.npmjs.com/package/blorq-logger"><img src="https://img.shields.io/npm/dm/blorq-logger?color=blue" alt="npm downloads"/></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-green" alt="MIT license"/></a>
  <img src="https://img.shields.io/badge/node-%3E%3D18-brightgreen" alt="Node ≥ 18"/>
  <img src="https://img.shields.io/badge/zero-dependencies-brightgreen" alt="Zero dependencies"/>
</div>

---

Works with **Express**, **Next.js**, **Fastify**, **Koa**, **NestJS**, and plain **Node.js**.

## Table of Contents

- [Installation](#installation)
- [Quick Setup](#quick-setup)
- [Structured Logging](#structured-logging)
- [Framework Adapters](#framework-adapters)
  - [Express / Connect / NestJS](#express--connect--nestjs)
  - [Next.js — Pages Router](#nextjs--pages-router)
  - [Next.js — App Router](#nextjs--app-router-middlewarejs)
  - [Fastify](#fastify)
  - [Koa](#koa)
  - [NestJS (TypeScript)](#nestjs-typescript)
- [Configuration Reference](#configuration-reference)
- [Console Drop-in](#console-drop-in)
- [Graceful Shutdown](#graceful-shutdown)
- [How Request Logs Appear in Blorq](#how-request-logs-appear-in-blorq)
- [TypeScript](#typescript)
- [License](#license)

---

## Installation

```bash
npm install blorq-logger
```

> **Requires Node.js ≥ 18.** Zero production dependencies.

---

## Quick Setup

```js
const logger = require('blorq-logger');

logger.configure({
  appName:   'my-api',
  remoteUrl: 'http://localhost:9900/api/logs',  // your Blorq instance
  apiKey:    process.env.BLORQ_API_KEY,
});

// Optional: patch console.* globally — zero code changes needed elsewhere
logger.install();
```

Once `logger.install()` is called, every existing `console.log()`, `console.warn()`, and `console.error()` in your app ships to Blorq automatically — while still printing to your terminal.

---

## Structured Logging

```js
const logger = require('blorq-logger');

// Root logger
logger.info('Server started', { port: 3000 });
logger.warn('Rate limit approaching', { userId: 'u123' });
logger.error('DB timeout', new Error('Connection refused'));

// Named child logger — carries context into every line it emits
const paymentLog = logger.create({ service: 'PaymentService', version: '2' });
paymentLog.info('Charge processed', { amount: 99, currency: 'USD' });

// Chain: inherit parent context and add more
const reqLog = paymentLog.child({ requestId: req.requestId });
reqLog.error('Stripe declined', new Error('card_declined'));
```

Every log line is emitted as structured JSON:

```json
{
  "ts": "2024-01-15T10:23:45.000Z",
  "level": "ERROR",
  "appName": "my-api",
  "service": "PaymentService",
  "requestId": "abc-123",
  "message": "Stripe declined",
  "data": [{ "error": "card_declined", "stack": "..." }]
}
```

---

## Framework Adapters

### Express / Connect / NestJS

```js
const express = require('express');
const logger  = require('blorq-logger');

logger.configure({ appName: 'my-api', remoteUrl: '...', apiKey: '...' });

const app = express();

// Ships every request as a structured log to {appName}-requests/
app.use(logger.requestLogger());

// req.blorqLogger is a per-request child logger pre-loaded with requestId
app.get('/users/:id', (req, res) => {
  req.blorqLogger.info('Fetching user', { userId: req.params.id });
  res.json({ ok: true });
});
```

---

### Next.js — Pages Router

```js
// pages/api/hello.js
const logger = require('blorq-logger');
const { withLogger } = require('blorq-logger/next');

logger.configure({ appName: 'my-nextapp', remoteUrl: '...', apiKey: '...' });

export default withLogger(async (req, res) => {
  logger.info('hello called');
  res.json({ message: 'hello' });
});
```

---

### Next.js — App Router (`middleware.js`)

```js
// middleware.js  (runs in Edge Runtime)
import { nextMiddleware } from 'blorq-logger/next';

export default nextMiddleware({
  appName:   'my-nextapp',
  remoteUrl: 'https://blorq.yourdomain.com/api/logs',
  apiKey:    process.env.BLORQ_API_KEY,
});

export const config = { matcher: '/api/:path*' };
```

---

### Fastify

```js
const fastify = require('fastify')();
const logger  = require('blorq-logger');

logger.configure({ appName: 'my-api', remoteUrl: '...', apiKey: '...' });

// Register as a Fastify plugin
await fastify.register(logger.requestLogger({ framework: 'fastify' }));

fastify.get('/hello', async (request) => {
  request.log.info('hello route hit');   // per-request structured logger
  return { hello: 'world' };
});
```

---

### Koa

```js
const Koa    = require('koa');
const logger = require('blorq-logger');

logger.configure({ appName: 'my-api', remoteUrl: '...', apiKey: '...' });

const app = new Koa();
app.use(logger.requestLogger({ framework: 'koa' }));

app.use(async ctx => {
  ctx.log.info('request received');      // per-request structured logger
  ctx.body = 'hello';
});
```

---

### NestJS (TypeScript)

```ts
// main.ts
import logger from 'blorq-logger';
import { requestMiddleware } from 'blorq-logger/express';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  logger.configure({
    appName:          'my-nest-api',
    remoteUrl:        process.env.BLORQ_URL,
    apiKey:           process.env.BLORQ_API_KEY,
    interceptConsole: true,              // capture NestJS's own console output
  });

  const app = await NestFactory.create(AppModule);
  app.use(requestMiddleware());           // from 'blorq-logger/express'
  await app.listen(3000);
}
bootstrap();
```

---

## Configuration Reference

Options can be set via `configure()` or environment variables. Environment variables take precedence.

| Option | Env var | Default | Description |
|---|---|---|---|
| `appName` | `BLORQ_APP_NAME` | `'app'` | Name of your service |
| `remoteUrl` | `BLORQ_URL` | `null` | Blorq ingest URL |
| `apiKey` | `BLORQ_API_KEY` | `''` | `X-Api-Key` header value |
| `level` | `BLORQ_LEVEL` | `'info'` | Minimum level: `debug \| info \| warn \| error \| fatal \| silent` |
| `prettyPrint` | — | `true` in dev | Pretty-print JSON to stdout |
| `stdout` | — | `true` | Write to `process.stdout` in addition to remote |
| `interceptConsole` | `BLORQ_INTERCEPT` | `false` | Patch `console.*` globally |
| `bufferSize` | — | `50` | Flush when buffer reaches this many entries |
| `flushIntervalMs` | — | `200` | Flush timer in milliseconds |
| `remoteTimeoutMs` | — | `3000` | HTTP timeout for remote sends |
| `remoteRetries` | — | `2` | Retry attempts on network failure |
| `skipPaths` | `BLORQ_SKIP_PATHS` | `/health,/ping,/favicon,/_next/static` | Paths skipped by `requestLogger()` |

### `.env` example

```bash
BLORQ_APP_NAME=my-api
BLORQ_URL=http://blorq:9900/api/logs
BLORQ_API_KEY=blq_abc123...
BLORQ_LEVEL=info
BLORQ_INTERCEPT=true
```

---

## Console Drop-in

Have a codebase full of `console.log()` and don't want to touch every file? Add two lines at your entry point:

```js
// At the very top of your entry file (e.g. server.js / index.js)
const logger = require('blorq-logger');
logger.configure({ appName: 'my-api', remoteUrl: '...', apiKey: '...' });
logger.install();

// From here, every console.log / console.warn / console.error ships to Blorq
// and still prints to the terminal — no other files need changing.
```

Or as a scoped `console` replacement within a single file:

```js
const console = require('blorq-logger').console;
// console.log / warn / error / debug in this file now go to Blorq
```

---

## Graceful Shutdown

The logger auto-flushes on `SIGINT`, `SIGTERM`, and `beforeExit`. For explicit control:

```js
process.on('SIGTERM', async () => {
  await logger.flush();
  process.exit(0);
});
```

---

## How Request Logs Appear in Blorq

Request logs land in `logs/{appName}-requests/{date}.log` and are visible under **Insights → API Analytics**:

```json
{
  "ts": "2024-01-15T10:23:45.000Z",
  "level": "INFO",
  "appName": "my-api-requests",
  "type": "api_request",
  "requestId": "uuid",
  "method": "POST",
  "path": "/api/orders",
  "statusCode": 201,
  "durationMs": 47.2,
  "reqSizeBytes": 128,
  "resSizeBytes": 256
}
```

---

## TypeScript

Full types are included via `src/index.d.ts` — no `@types` package needed:

```ts
import logger, { Logger, BlorqConfig } from 'blorq-logger';

logger.configure({ appName: 'my-api' } satisfies BlorqConfig);

const paymentLog: Logger = logger.create({ service: 'PaymentService' });
paymentLog.info('Charge processed', { amount: 99 });
```

---

## License

[MIT](LICENSE) — free to use, modify, and distribute.
