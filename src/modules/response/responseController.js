const { getAdminClient } = require('../../configs/supabaseConfig');
const supabase = getAdminClient();
const { ResponseHandler } = require('../../shared/handlers/responseHandler');
const ApiError = require('../../utils/apiError');
const responseService = require('./responseService');

/**
 * Get all responses for a profile (response_type = 'profile')
 * @param {Request} req
 * @param {Response} res
 */
const getProfileResponses = async (req, res) => {
  const { profileId } = req.params;
  try {
    const responses = await responseService.fetchProfileResponses(profileId);
    return ResponseHandler.success(res, responses, 'Profile responses fetched successfully');
  } catch (error) {
    return ResponseHandler.error(res, error.message || 'Failed to fetch responses', error.statusCode || 500);
  }
};

module.exports = {
  getProfileResponses
}; 