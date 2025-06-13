// src/shared/middlewares/standardMiddleware.js
const morgan = require('morgan');
const express = require('express');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const config = require('../../configs/envConfig.js');

/**
 * Applies standard middlewares for parsing, logging, cookies, and compression
 * @param {import('express').Application} app - Express application instance
 */
const standardMiddleware = (app) => {
  const isDev = config.server.env === 'development';
  // Logging HTTP requests using morgan
  app.use(morgan(isDev ? 'dev' : 'combined'));
  // JSON body parser with size limit
  app.use(express.json({ limit: config.server.bodyLimit || '10kb' }));
  // URL-encoded form parser
  app.use(
    express.urlencoded({
      extended: true,
      limit: config.server.bodyLimit || '10kb'
    })
  );
  // Parse Cookie headers into `req.cookies`
  app.use(cookieParser());
  // Gzip compression for responses
  app.use(compression());
};

module.exports = standardMiddleware;
