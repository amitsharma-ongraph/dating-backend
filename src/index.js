// src/index.js
const http = require('http');
const dotenv = require('dotenv');
const bootstrapApp = require('./app.js');
const config = require('./configs/envConfig.js');
const { colorLogger } = require('./utils/logger.js');
const gracefulHandler = require('./shared/handlers/gracefulHandler.js');

dotenv.config();

const startServer = async () => {
  try {
    const app = await bootstrapApp();

    const server = http.createServer(app);

    server.listen(config.server.port, () => {
      colorLogger.info(`Server running on port ${config.server.port} in ${config.server.env} mode`);
    });

    gracefulHandler(server);
  } catch (err) {
    colorLogger.error('Failed to start http server:', err);
    process.exit(1);
  }
};

startServer();
