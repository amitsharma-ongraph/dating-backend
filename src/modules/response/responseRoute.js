const express = require('express');
const router = express.Router();
const responseController = require('./responseController');

// GET /profile-response/:profileId - fetch all profile-type responses for a profile
router.get('/profile-response/:profileId', responseController.getProfileResponses);

module.exports = router; 