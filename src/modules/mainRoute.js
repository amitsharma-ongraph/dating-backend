// src/modules/mainRoute.js
const express = require('express');
const authRoutes = require('./auth/authRoute.js');
const photoRoutes = require('./user/photo/photoRoute.js');
const videoRoutes = require('./user/video/videoRoute.js');
const tokenRoutes = require('./token/tokenRoute.js');
const responseRoute = require('./response/responseRoute');

const router = express.Router();

// Mount auth routes
router.use('/auth', authRoutes);
router.use('/photos', photoRoutes);
router.use('/videos', videoRoutes);
router.use('/tokens', tokenRoutes);
router.use('/responses', responseRoute);

module.exports = router;

