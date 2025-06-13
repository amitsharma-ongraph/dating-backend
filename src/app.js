// src/app.js
const express = require('express');
const swaggerUi = require('swagger-ui-express');
const config = require('./configs/envConfig');
const { logger, colorLogger } = require('./utils/logger');
const setupSwagger = require('./configs/swaggerConfig');
const securityMiddleware = require('./shared/middlewares/securityMiddleware');
const standardMiddleware = require('./shared/middlewares/standardMiddleware');
const { ResponseHandler } = require('./shared/handlers/responseHandler');
const { errorConverter, errorHandler, notFoundHandler } = require('./shared/handlers/errorHandler');
const apiRoutes = require('./modules/mainRoute');

const bootstrapApp = async () => {
  const app = express();

  // Standard parsing & compression middleware
  standardMiddleware(app);

  // Security headers, CORS, rate-limiting
  securityMiddleware(app);

  // Unified response helper methods
  app.use((req, res, next) => {
    // Attach response handler methods to response object
    res.success = (data, message, statusCode) =>
      ResponseHandler.success(res, data, message, statusCode);
    res.error = (message, statusCode, errors) =>
      ResponseHandler.error(res, message, statusCode, errors);
    res.created = (data, message) => ResponseHandler.created(res, data, message);
    res.noContent = () => ResponseHandler.noContent(res);
    next();
  });

  // Health check route
  app.get('/health', (req, res) => {
    colorLogger.debug('Health check requested');
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      environment: config.server.env,
      uptime: process.uptime()
    });
  });

  // Setup Swagger API Documentation
  setupSwagger(app);

  // API Routes
  app.use('/api/v1', apiRoutes);

  // Catch undefined routes
  app.use(notFoundHandler);

  // Error handling chain
  app.use(errorConverter);
  app.use(errorHandler);

  colorLogger.info('Application bootstrapped successfully');
  return app;
};

module.exports = bootstrapApp;
