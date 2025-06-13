// src/modules/mainRoute.js
const express = require('express');
const authRoutes = require('./auth/authRoute.js');

const router = express.Router();

// Mount auth routes
router.use('/auth', authRoutes);

module.exports = router;
