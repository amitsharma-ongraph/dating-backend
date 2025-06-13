// src/configs/swaggerConfig.js
const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');
const { version } = require('../../package.json');
const config = require('./envConfig.js');

/**
 * Swagger configuration options
 */
const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Dating App API Documentation',
      version,
      description: 'Token-based dating platform API documentation',
      license: {
        name: 'MIT',
        url: 'https://opensource.org/licenses/MIT'
      },
      contact: {
        name: 'API Support',
        email: 'support@example.com'
      }
    },
    servers: [
      {
        url: `${config.server.url}/api/v1`,
        description: `${config.server.env} server`
      }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT'
        }
      }
    }
  },
  // Path to the API docs - be specific to avoid duplications
  apis: ['./src/modules/auth/authRoute.js', './src/modules/auth/authValidator.js']
};

const specs = swaggerJsdoc(options);

/**
 * Configure and setup Swagger UI
 * @param {Express} app - Express application
 */
const setupSwagger = (app) => {
  // Swagger page
  app.use(
    '/api/v1/docs',
    swaggerUi.serve,
    swaggerUi.setup(specs, {
      explorer: true,
      customCss: '.swagger-ui .topbar { display: none }'
    })
  );

  // Swagger JSON
  app.get('/api/v1/docs.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(specs);
  });
};

module.exports = setupSwagger;
