// src/utils/logger.js
const fs = require('fs');
const path = require('path');
const morgan = require('morgan');
const winston = require('winston');
const { v4: uuidv4 } = require('uuid');
const config = require('../configs/envConfig.js');

// Ensure log directory exists
const isDevelopment = config.server.env === 'development';

const logDir = isDevelopment?path.resolve(process.cwd(), 'logs'):path.join('/tmp', 'logs');

if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// Define custom colors for log levels
const customColors = {
  error: 'bold red',
  warn: 'bold yellow',
  info: 'bold green',
  http: 'bold cyan',
  verbose: 'bold blue',
  debug: 'bold magenta',
  silly: 'bold gray'
};

// Apply custom colors to Winston
winston.addColors(customColors);

// Custom format for pretty-printed JSON in Winston
const prettyJsonFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
    // For JSON logs with rich context
    const logData = {
      timestamp,
      level,
      message,
      ...(stack && { stack }),
      ...(Object.keys(meta).length > 0 && { ...meta })
    };
    return JSON.stringify(logData, null, 2);
  })
);

// Console format for development
const consoleFormat = winston.format.combine(
  winston.format.colorize({ all: true }),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
  winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
    // Return formatted log line with colors
    return `${level} [${timestamp}]: ${message}${stack ? `\n${stack}` : ''}${
      Object.keys(meta).length ? `\n${JSON.stringify(meta, null, 2)}` : ''
    }`;
  })
);

// Create the logger
const logger = winston.createLogger({
  level: 'info',
  format: prettyJsonFormat,
  transports: [
    // Write all errors to error.log
    new winston.transports.File({
      filename: path.join(logDir, 'error.log'),
      level: 'error',
      maxsize: 10485760, // 10MB
      maxFiles: 5
    }),
    // Write all logs to combined.log
    new winston.transports.File({
      filename: path.join(logDir, 'combined.log'),
      maxsize: 10485760, // 10MB
      maxFiles: 5
    })
  ],
  exceptionHandlers: [
    new winston.transports.File({
      filename: path.join(logDir, 'exceptions.log'),
      maxsize: 10485760, // 10MB
      maxFiles: 5
    })
  ],
  rejectionHandlers: [
    new winston.transports.File({
      filename: path.join(logDir, 'rejections.log'),
      maxsize: 10485760, // 10MB
      maxFiles: 5
    })
  ]
});

// Add console transport in development
if (config.server.env !== 'production') {
  logger.add(
    new winston.transports.Console({
      format: consoleFormat,
      handleExceptions: true,
      handleRejections: true
    })
  );
} else {
  // Add basic console transport in production
  logger.add(
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize({ all: true }),
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.printf(({ level, message, timestamp }) => {
          return `${timestamp} ${level}: ${message}`;
        })
      ),
      level: 'error' // Only log errors in production console
    })
  );
}

// Enhanced error logging function
logger.logError = (err, req) => {
  const logData = {
    method: req.method,
    url: req.originalUrl || req.url,
    status: err.statusCode || 500,
    responseTime: req.startTime ? `${Date.now() - req.startTime}ms` : undefined,
    userAgent: req.get ? req.get('user-agent') : req.headers['user-agent'],
    clientIP: req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress,
    requestId: req.id || uuidv4(),
    error: {
      message: err.message,
      stack: err.stack
    }
  };

  logger.error(JSON.stringify(logData, null, 2));
};

// Custom tokens for Morgan
morgan.token('method-padded', (req) => req.method.padEnd(6));
morgan.token('status-padded', (req, res) => String(res.statusCode).padEnd(5));
morgan.token('response-ms', (req, res) => {
  const time = morgan['response-time'](req, res);
  return time ? `${time} ms`.padEnd(8) : '- ms'.padEnd(8);
});
morgan.token('request-id', (req) => {
  if (!req.id) {
    req.id = uuidv4();
  }
  return req.id;
});

// Morgan format for development
const morganDevFormat = (tokens, req, res) => {
  // Add start time for response time calculation
  if (!req.startTime) {
    req.startTime = Date.now();
  }

  const method = tokens['method-padded'](req, res);
  const status = tokens['status-padded'](req, res);
  const responseTime = tokens['response-time'](req, res)
    ? `${tokens['response-time'](req, res)} ms`.padEnd(8)
    : '- ms'.padEnd(8);
  const url = tokens.url(req, res);
  const timestamp = new Date().toISOString().replace(/T/, ' ').replace(/\..+/, '');

  // Color the status code based on the response
  let statusColor = status;
  if (res.statusCode >= 500) {
    statusColor = `\x1b[31m${status}\x1b[0m`; // Red for server errors
  } else if (res.statusCode >= 400) {
    statusColor = `\x1b[33m${status}\x1b[0m`; // Yellow for client errors
  } else if (res.statusCode >= 300) {
    statusColor = `\x1b[36m${status}\x1b[0m`; // Cyan for redirects
  } else {
    statusColor = `\x1b[32m${status}\x1b[0m`; // Green for success
  }

  // Get HTTP method color
  let methodColor;
  switch (req.method) {
    case 'GET':
      methodColor = '\x1b[36m' + method + '\x1b[0m'; // Cyan
      break;
    case 'POST':
      methodColor = '\x1b[32m' + method + '\x1b[0m'; // Green
      break;
    case 'PUT':
    case 'PATCH':
      methodColor = '\x1b[33m' + method + '\x1b[0m'; // Yellow
      break;
    case 'DELETE':
      methodColor = '\x1b[31m' + method + '\x1b[0m'; // Red
      break;
    default:
      methodColor = '\x1b[37m' + method + '\x1b[0m'; // White
  }

  // Log in the format: HTTP [TIMESTAMP]: METHOD URL STATUS RESPONSE_TIME
  return `http [${timestamp}]: ${methodColor} ${url} ${statusColor} ${responseTime}`;
};

// Morgan format for production - JSON format
const morganProdFormat = (tokens, req, res) => {
  // Create the log object with all requested fields
  const logData = {
    timestamp: new Date().toISOString(),
    level: res.statusCode >= 400 ? 'error' : 'info',
    message: `${req.method} ${req.url} ${res.statusCode}`,
    method: req.method,
    url: req.url,
    status: res.statusCode,
    responseTime: tokens['response-time'](req, res)
      ? `${tokens['response-time'](req, res)}ms`
      : undefined,
    userAgent: req.headers['user-agent'],
    clientIP: req.headers['x-forwarded-for'] || req.socket.remoteAddress,
    requestId: tokens['request-id'](req, res)
  };

  // Add error information if status code indicates error
  if (res.statusCode >= 400) {
    logData.error = {
      message: res.statusMessage || 'Error occurred'
    };

    // Add error stack if available (needs to be set by error handler)
    if (res.locals && res.locals.errorStack) {
      logData.error.stack = res.locals.errorStack;
    }
  }

  return JSON.stringify(logData);
};

// Create Morgan middleware for HTTP request logging
const httpLogger = morgan(
  config.server.env === 'development' ? morganDevFormat : morganProdFormat,
  {
    stream: {
      write: (message) => {
        try {
          // For production, parse the JSON and log with appropriate level
          if (config.server.env !== 'development') {
            const logObject = JSON.parse(message);
            const level = logObject.level || 'info';
            delete logObject.level; // Avoid duplication
            logger[level](logObject.message, logObject);
          } else {
            // For development, just output the formatted string
            if (message.trim()) {
              // Using console directly as this is the logger implementation itself
              console.log(message.trim());
            }
          }
        } catch (err) {
          // Fallback if parsing fails
          logger.info(message.trim());
        }
      }
    },
    skip: (req) => {
      // Skip logging for assets in development
      if (config.server.env === 'development') {
        return (
          req.url.match(/\.(ico|png|jpg|jpeg|gif|svg|css|js|map)$/) || req.url === '/favicon.ico'
        );
      }
      return false;
    }
  }
);

// Request ID middleware
const requestIdMiddleware = (req, res, next) => {
  req.id = req.id || req.headers['x-request-id'] || uuidv4();
  res.setHeader('X-Request-ID', req.id);

  // Add startTime for response time calculation
  req.startTime = Date.now();

  next();
};

// Convenience logging methods with emoji icons
const colorLogger = {
  success: (message, meta = {}) => logger.info(`${message}`, meta),
  error: (message, meta = {}) => logger.error(`${message}`, meta),
  warn: (message, meta = {}) => logger.warn(`${message}`, meta),
  info: (message, meta = {}) => logger.info(`${message}`, meta),
  debug: (message, meta = {}) => logger.debug(`${message}`, meta),
  http: (message, meta = {}) => logger.http(`${message}`, meta)
};

module.exports = {
  logger,
  httpLogger,
  requestIdMiddleware,
  colorLogger
};
