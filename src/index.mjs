// ESM re-export wrapper — allows `import logger from 'blorq-logger'`
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const logger  = require('./index.js');

export default logger;
export const configure      = logger.configure.bind(logger);
export const create         = logger.create.bind(logger);
export const install        = logger.install.bind(logger);
export const uninstall      = logger.uninstall.bind(logger);
export const express        = (...a) => logger.express(...a);
export const nextjs         = (...a) => logger.nextjs(...a);
export const fastify        = logger.fastify;
export const node           = (...a) => logger.node(...a);
export const nestjs         = (...a) => logger.nestjs(...a);

export const debug  = (...a) => logger.debug(...a);
export const info   = (...a) => logger.info(...a);
export const warn   = (...a) => logger.warn(...a);
export const error  = (...a) => logger.error(...a);
export const fatal  = (...a) => logger.fatal(...a);
export const flush  = () => logger.flush();
