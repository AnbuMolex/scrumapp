// src/logger.js
const { createLogger, format, transports } = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');

const jsonFmt = format.combine(
  format.timestamp(),
  format.errors({ stack: true }),
  format.splat(),
  format.json()
);

const appLogger = createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: jsonFmt,
  transports: [
    new DailyRotateFile({
      dirname: process.env.LOG_DIR || 'logs',
      filename: 'app-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxSize: process.env.LOG_MAX_SIZE || '20m',
      maxFiles: process.env.LOG_RETENTION || '30d',
      zippedArchive: true,
    }),
    new transports.Console({ format: format.combine(format.colorize(), format.simple()) }),
  ],
});

module.exports = appLogger;
