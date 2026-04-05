/**
 * blorq-logger — TypeScript definitions
 */

export interface BlorqConfig {
  /** Application name (default: APP_NAME env or 'app') */
  appName?: string;
  /** Blorq ingest URL e.g. http://localhost:9900/api/logs */
  remoteUrl?: string | null;
  /** API key for Blorq (X-Api-Key header) */
  apiKey?: string;
  /** Minimum log level: 'debug' | 'info' | 'warn' | 'error' | 'fatal' | 'silent' */
  level?: "debug" | "info" | "warn" | "error" | "fatal" | "silent";
  /** Pretty-print JSON to stdout (default: true in development) */
  prettyPrint?: boolean;
  /** Also write to process.stdout (default: true) */
  stdout?: boolean;
  /** Intercept console.log/warn/error/debug and ship them too */
  interceptConsole?: boolean;
  /** Flush when buffer reaches this size (default: 50) */
  bufferSize?: number;
  /** Flush interval in ms (default: 200) */
  flushIntervalMs?: number;
  /** HTTP timeout for remote sends in ms (default: 3000) */
  remoteTimeoutMs?: number;
  /** Retry attempts for failed sends (default: 2) */
  remoteRetries?: number;
  /** Paths skipped by requestLogger (default: /health, /ping, /favicon) */
  skipPaths?: string[];
}

export interface RequestLoggerOptions {
  framework?: "express" | "next" | "fastify" | "koa";
  appName?: string;
  skipPaths?: string[];
}

export declare class Logger {
  constructor(context?: Record<string, unknown>);
  child(extra?: Record<string, unknown>): Logger;
  with(extra?: Record<string, unknown>): this;
  debug(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
  fatal(message: string, ...args: unknown[]): void;
  flush(): Promise<void>;
}

declare const logger: Logger & {
  configure(opts: BlorqConfig): void;
  create(context?: Record<string, unknown>): Logger;
  install(): void;
  uninstall(): void;
  requestLogger(
    opts?: RequestLoggerOptions,
  ): (req: unknown, res: unknown, next?: unknown) => void;
  requestId(): string;
  console: {
    log: (...args: unknown[]) => void;
    info: (...args: unknown[]) => void;
    warn: (...args: unknown[]) => void;
    error: (...args: unknown[]) => void;
    debug: (...args: unknown[]) => void;
  };
};

export default logger;
// module.exports = logger;
