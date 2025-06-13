// src/shared/middlewares/securityMiddleware.js
const hpp = require('hpp');
const cors = require('cors');
const helmet = require('helmet');
const { xss } = require('express-xss-sanitizer');
const rateLimit = require('express-rate-limit');
const config = require('../../configs/envConfig.js');

/**
 * Apply security middleware to Express app
 * @param {Object} app - Express app instance
 */
const securityMiddleware = (app) => {
  // Helmet helps secure Express apps by setting HTTP response headers
  app.use(helmet());
  // HPP protect against HTTP Parameter Pollution attacks
  app.use(hpp());
  // XSS sanitizer to prevent Cross-Site Scripting
  app.use(xss());
  // Disable X-Powered-By header
  app.disable('x-powered-by');
  
  // CORS configuration - allow frontend requests
  app.use(
    cors({
      origin: config.server.allowedOrigins,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      credentials: true,
      exposedHeaders: ['Content-Disposition']
    })
  );
  
  // Rate limiting
  app.use(
    rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 100,
      message: {
        status: 'error',
        message: 'Too many requests from this IP, please try again later.'
      },
      standardHeaders: true,
      legacyHeaders: false
    })
  );
};

module.exports = securityMiddleware;
