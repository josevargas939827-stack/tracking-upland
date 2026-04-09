const axios = require('axios');

const BASE_URL = 'https://uplytics.org/include/api_neighborhoods.php';

/**
 * Fetches neighborhood details (name, residents, property_count).
 * @param {number|string} id - Neighborhood ID.
 * @returns {{name: string, residents: number, property_count: number}}
 */
async function fetchNeighborhoodDetails(id) {
  try {
    const response = await axios.get(BASE_URL, {
      params: { action: 'get_details', id },
      timeout: 10_000
    });

    const data = response.data;
    return {
      name: data.name,
      residents: Number(data.residents),
      property_count: Number(data.property_count)
    };
  } catch (err) {
    console.error(`Uplytics API error for id=${id}:`, err.message);
    throw new Error('Uplytics API request failed');
  }
}

module.exports = { fetchNeighborhoodDetails };
