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
  apis: [
    './src/modules/auth/authRoute.js',
    './src/modules/auth/authValidator.js',
    './src/modules/user/photo/photoRoute.js',
    './src/modules/user/photo/photoValidator.js',
    './src/modules/user/video/videoRoute.js',
    './src/modules/user/video/videoValidator.js',
    './src/modules/token/tokenRoute.js',
    './src/modules/token/tokenValidator.js',
  ]
};

const specs = swaggerJsdoc(options);

/**
 * Configure and setup Swagger UI
 * @param {Express} app - Express application
 */
const setupSwagger = (app) => {
  // Set trust proxy for Vercel
  app.set('trust proxy', 1);

  // Simplified Swagger UI options - no external CDN assets
  const swaggerUiOptions = {
    explorer: true,
    customCss: `
      .swagger-ui .topbar { display: none }
      .swagger-ui .info { margin: 50px 0 }
      .swagger-ui .scheme-container { background: #fafafa; padding: 30px 0 }
    `,
    swaggerOptions: {
      docExpansion: 'none',
      persistAuthorization: true,
      displayRequestDuration: true,
      tryItOutEnabled: true
    }
  };

  // Swagger UI route
  app.use('/api/v1/docs', swaggerUi.serve, swaggerUi.setup(specs, swaggerUiOptions));

  // Swagger JSON route
  app.get('/api/v1/docs.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(specs);
  });

  // Health check for docs
  app.get('/api/v1/docs/health', (req, res) => {
    res.json({ 
      status: 'ok', 
      message: 'Swagger documentation is available',
      docsUrl: '/api/v1/docs' 
    });
  });
};

module.exports = setupSwagger;