import pino, { LoggerOptions } from 'pino';

type Level = 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace';

export interface CreateLoggerOptions extends LoggerOptions {
  name?: string;
  level?: Level;
}

const baseOptions: LoggerOptions = {
  level: (process.env.LOG_LEVEL as Level) ?? 'info',
  redact: ['req.headers.authorization', 'token', 'discordToken'],
};

export function createLogger(options: CreateLoggerOptions = {}) {
  return pino({ ...baseOptions, ...options });
}
