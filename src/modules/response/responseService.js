const { getAdminClient } = require('../../configs/supabaseConfig');
const supabase = getAdminClient();
const ApiError = require('../../utils/apiError');

/**
 * Fetch all responses for a profile (response_type = 'profile')
 * @param {string} profileId
 * @returns {Promise<Array>} Array of responses
 */
const fetchProfileResponses = async (profileId) => {
  if (!profileId) {
    throw new ApiError(400, 'Profile ID is required');
  }
  const { data, error } = await supabase
    .from('viewer_responses')
    .select('*')
    .eq('profile_id', profileId)
    .eq('response_type', 'profile');
  if (error) {
    throw new ApiError(500, error.message || 'Failed to fetch responses');
  }
  return data;
};

module.exports = {
  fetchProfileResponses
}; 