// src/shared/handlers/gracefulHandler.js
const { colorLogger } = require('../../utils/logger.js');

const gracefulHandler = (server) => {
  const handleShutdown = async (signal) => {
    colorLogger.warn(`Received ${signal}. Shutting down...`);
    server.close(async () => {
      colorLogger.warn('HTTP server closed.');
      process.exit(0);
    });
  };

  process.on('SIGINT', () => handleShutdown('SIGINT'));
  process.on('SIGTERM', () => handleShutdown('SIGTERM'));

  process.on('unhandledRejection', (reason, promise) => {
    colorLogger.error('Unhandled Rejection:', reason);
  });

  process.on('uncaughtException', (err) => {
    colorLogger.error('Uncaught Exception:', err);
    process.exit(1);
  });
};

module.exports = gracefulHandler;
