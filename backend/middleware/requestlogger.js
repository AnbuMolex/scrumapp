// src/middleware/requestLogger.js
const morgan = require('morgan');
const logger = require('../logger');

const stream = {
  write: (message) => {
    try {
      const parsed = JSON.parse(message);
      logger.info(parsed);
    } catch {
      logger.info(message.trim());
    }
  }
};

// JSON log line: method, url, status, response-time, userId
const jsonFormat = (tokens, req, res) => JSON.stringify({
  type: 'http',
  method: tokens.method(req, res),
  url: tokens.url(req, res),
  status: Number(tokens.status(req, res)),
  'response-time-ms': Number(tokens['response-time'](req, res)),
  'content-length': Number(tokens.res(req, res, 'content-length') || 0),
  userId: req.user?.id || null,
  ts: tokens.date(req, res, 'iso'),
});

module.exports = morgan(jsonFormat, { stream });
