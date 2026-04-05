# blorq-logger

Zero-dependency structured logger for Node.js ≥18. Ships logs to [Blorq](https://github.com/your-org/blorq) or any compatible HTTP endpoint. Works with **Express**, **Next.js**, **Fastify**, **Koa**, **NestJS**, and plain **Node.js**.

```bash
npm install blorq-logger
```

---

## Quick setup (any framework)

```js
const logger = require('blorq-logger');

logger.configure({
  appName:  'my-api',
  remoteUrl: 'http://localhost:9900/api/logs',  // your Blorq instance
  apiKey:    process.env.BLORQ_API_KEY,
});

// Intercept existing console.log/warn/error — zero other changes needed
logger.install();
```

From here, **every existing `console.log()`** in your app ships to Blorq automatically, while still printing to the terminal. No code changes needed in existing files.

---

## Structured logging

```js
const logger = require('blorq-logger');

// Root logger
logger.info('Server started', { port: 3000 });
logger.warn('Rate limit approaching', { userId: 'u123' });
logger.error('DB timeout', new Error('Connection refused'));

// Child loggers — carry context into every line they emit
const paymentLog = logger.create({ service: 'PaymentService', version: '2' });
paymentLog.info('Charge processed', { amount: 99, currency: 'USD' });

// Chain: inherit + add more context
const reqLog = paymentLog.child({ requestId: req.requestId });
reqLog.error('Stripe declined', new Error('card_declined'));
```

Each log line is structured JSON:
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

## Framework adapters

### Express / NestJS / Connect

```js
const express = require('express');
const logger  = require('blorq-logger');

logger.configure({ appName: 'my-api', remoteUrl: '...', apiKey: '...' });

const app = express();

// Ships every request as a structured log to {appName}-requests/
app.use(logger.requestLogger());

// req.blorqLogger is a child logger pre-loaded with requestId
app.get('/users/:id', (req, res) => {
  req.blorqLogger.info('Fetching user', { userId: req.params.id });
  res.json({ ok: true });
});
```

### Next.js — Pages Router (API routes)

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

### Next.js — App Router (middleware.js)

```js
// middleware.js (runs in Edge Runtime)
import { nextMiddleware } from 'blorq-logger/next';

export default nextMiddleware({
  appName:   'my-nextapp',
  remoteUrl: 'https://blorq.yourdomain.com/api/logs',
  apiKey:    process.env.BLORQ_API_KEY,
});

export const config = { matcher: '/api/:path*' };
```

### Fastify

```js
const fastify = require('fastify')();
const logger  = require('blorq-logger');

logger.configure({ appName: 'my-api', remoteUrl: '...', apiKey: '...' });

// Register as a Fastify plugin
await fastify.register(logger.requestLogger({ framework: 'fastify' }));

fastify.get('/hello', async (request) => {
  request.log.info('hello route hit');        // per-request structured logger
  return { hello: 'world' };
});
```

### Koa

```js
const Koa    = require('koa');
const logger = require('blorq-logger');

logger.configure({ appName: 'my-api', remoteUrl: '...', apiKey: '...' });

const app = new Koa();
app.use(logger.requestLogger({ framework: 'koa' }));

app.use(async ctx => {
  ctx.log.info('request received');           // per-request structured logger
  ctx.body = 'hello';
});
```

### NestJS

```ts
// main.ts
import logger from 'blorq-logger';
import { requestMiddleware } from 'blorq-logger/express';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  logger.configure({
    appName:   'my-nest-api',
    remoteUrl: process.env.BLORQ_URL,
    apiKey:    process.env.BLORQ_API_KEY,
    interceptConsole: true,             // capture NestJS's own console output
  });

  const app = await NestFactory.create(AppModule);
  app.use(requestMiddleware());          // from 'blorq-logger/express'
  await app.listen(3000);
}
bootstrap();
```

---

## Configuration reference

All options can be set via `configure()` or environment variables.

| Option | Env var | Default | Description |
|---|---|---|---|
| `appName` | `BLORQ_APP_NAME` | `'app'` | Name of your service |
| `remoteUrl` | `BLORQ_URL` | `null` | Blorq ingest URL |
| `apiKey` | `BLORQ_API_KEY` | `''` | `X-Api-Key` value |
| `level` | `BLORQ_LEVEL` | `'info'` | Minimum level: `debug\|info\|warn\|error\|fatal\|silent` |
| `prettyPrint` | — | `true` in dev | Pretty-print JSON to stdout |
| `stdout` | — | `true` | Write to `process.stdout` (besides remote) |
| `interceptConsole` | `BLORQ_INTERCEPT` | `false` | Patch `console.*` globally |
| `bufferSize` | — | `50` | Flush when buffer hits this size |
| `flushIntervalMs` | — | `200` | Flush timer in ms |
| `remoteTimeoutMs` | — | `3000` | HTTP timeout for remote sends |
| `remoteRetries` | — | `2` | Retry attempts on failure |
| `skipPaths` | `BLORQ_SKIP_PATHS` | `/health,/ping,/favicon,/_next/static` | Paths skipped by `requestLogger()` |

### .env example

```bash
BLORQ_APP_NAME=my-api
BLORQ_URL=http://blorq:9900/api/logs
BLORQ_API_KEY=blq_abc123...
BLORQ_LEVEL=info
BLORQ_INTERCEPT=true
```

---

## Console drop-in

If you have a codebase full of `console.log()` and don't want to change anything:

```js
// At the very top of your entry file:
const logger = require('blorq-logger');
logger.configure({ appName: 'my-api', remoteUrl: '...', apiKey: '...' });
logger.install();   // patches console.* globally

// Everything from here ships to Blorq
// console.log, console.warn, console.error all still print to terminal too
```

Or use it as a direct `console` replacement in a single file:

```js
const console = require('blorq-logger').console;
// Now console.log/warn/error/debug in this file go to Blorq
```

---

## Graceful shutdown

The logger auto-flushes on `SIGINT`, `SIGTERM`, and `beforeExit`. For manual control:

```js
process.on('SIGTERM', async () => {
  await logger.flush();
  process.exit(0);
});
```

---

## How request logs appear in Blorq

Request logs land in `logs/{appName}-requests/{date}.log` and are visible in **Insights → API Analytics**. Each line contains:

```json
{
  "ts": "...",
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

Full types included via `src/index.d.ts`:

```ts
import logger, { Logger, BlorqConfig } from 'blorq-logger';

logger.configure({ appName: 'my-api' } satisfies BlorqConfig);

const paymentLog: Logger = logger.create({ service: 'PaymentService' });
paymentLog.info('Charge processed', { amount: 99 });
```

---

## License

MIT
# blorq-logger-package
