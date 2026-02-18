/**
 * Notion Integration Module
 * Handles database operations for Tax Sale Leads and Call Records
 */

const axios = require('axios');

// Notion API Configuration
const NOTION_API_BASE = 'https://api.notion.com/v1';
const NOTION_VERSION = '2022-06-28';

// Database IDs (should be set via environment variables)
const TAX_SALE_LEADS_DB_ID = process.env.NOTION_LEADS_DB_ID;
const CALL_RECORDS_DB_ID = process.env.NOTION_CALLS_DB_ID;

/**
 * Get Notion API headers
 * @returns {Object} Headers object
 */
function getHeaders() {
  const token = process.env.NOTION_API_TOKEN;
  if (!token) {
    throw new Error('NOTION_API_TOKEN environment variable is required');
  }
  return {
    'Authorization': `Bearer ${token}`,
    'Notion-Version': NOTION_VERSION,
    'Content-Type': 'application/json',
  };
}

/**
 * Create a new call record in the Call Records database
 * @param {string} leadId - The Notion page ID of the lead
 * @param {Object} callData - Call details
 * @param {string} callData.duration - Call duration (e.g., "5:30")
 * @param {string} callData.outcome - Call outcome (e.g., "Interested", "No Answer", "Not Interested")
 * @param {string} callData.notes - Call notes
 * @param {string} callData.recordingUrl - URL to call recording
 * @returns {Promise<Object>} Created call record
 */
async function createCallRecord(leadId, callData) {
  try {
    const dbId = CALL_RECORDS_DB_ID || process.env.NOTION_DATABASE_ID;
    if (!dbId) {
      throw new Error('Call Records database ID not configured');
    }

    const properties = {
      'Lead': {
        relation: [
          { id: leadId }
        ]
      },
      'Outcome': {
        select: {
          name: callData.outcome || 'No Answer'
        }
      },
      'Call Date': {
        date: {
          start: new Date().toISOString()
        }
      }
    };

    // Optional fields
    if (callData.duration) {
      properties['Duration'] = {
        rich_text: [{ text: { content: callData.duration } }]
      };
    }

    if (callData.notes) {
      properties['Notes'] = {
        rich_text: [{ text: { content: callData.notes } }]
      };
    }

    if (callData.recordingUrl) {
      properties['Recording URL'] = {
        url: callData.recordingUrl
      };
    }

    const response = await axios.post(
      `${NOTION_API_BASE}/pages`,
      {
        parent: { database_id: dbId },
        properties: properties
      },
      { headers: getHeaders() }
    );

    return {
      success: true,
      id: response.data.id,
      url: response.data.url,
      data: response.data
    };
  } catch (error) {
    console.error('Error creating call record:', error.response?.data || error.message);
    return {
      success: false,
      error: error.response?.data || error.message
    };
  }
}

/**
 * Update lead status after a call
 * @param {string} leadId - The Notion page ID of the lead
 * @param {string} outcome - Call outcome
 * @param {string} temperature - Lead temperature (Hot/Warm/Cold)
 * @returns {Promise<Object>} Updated lead
 */
async function updateLeadStatus(leadId, outcome, temperature) {
  try {
    // First, get current lead data to increment call attempts
    const currentLead = await axios.get(
      `${NOTION_API_BASE}/pages/${leadId}`,
      { headers: getHeaders() }
    );

    // Get current call attempts count
    let callAttempts = 0;
    if (currentLead.data.properties['Call Attempts']?.number) {
      callAttempts = currentLead.data.properties['Call Attempts'].number;
    }

    const properties = {
      'Last Contact': {
        date: {
          start: new Date().toISOString()
        }
      },
      'Call Attempts': {
        number: callAttempts + 1
      }
    };

    // Update temperature if provided
    if (temperature) {
      properties['Temperature'] = {
        select: {
          name: temperature
        }
      };
    }

    // Update status based on outcome
    if (outcome) {
      properties['Status'] = {
        select: {
          name: mapOutcomeToStatus(outcome)
        }
      };
    }

    const response = await axios.patch(
      `${NOTION_API_BASE}/pages/${leadId}`,
      { properties: properties },
      { headers: getHeaders() }
    );

    return {
      success: true,
      id: response.data.id,
      callAttempts: callAttempts + 1,
      temperature: temperature,
      data: response.data
    };
  } catch (error) {
    console.error('Error updating lead status:', error.response?.data || error.message);
    return {
      success: false,
      error: error.response?.data || error.message
    };
  }
}

/**
 * Map call outcome to lead status
 * @param {string} outcome - Call outcome
 * @returns {string} Lead status
 */
function mapOutcomeToStatus(outcome) {
  const outcomeMap = {
    'Interested': 'Interested',
    'Callback Requested': 'Callback',
    'Not Interested': 'Not Interested',
    'Wrong Number': 'Invalid',
    'No Answer': 'No Answer',
    'Voicemail': 'Voicemail Left',
    'Do Not Call': 'DNC',
    'Appointment Set': 'Appointment Set',
    'Follow-up Needed': 'Follow-up'
  };
  return outcomeMap[outcome] || 'Contacted';
}

/**
 * Get hot leads (score >= 80, not called in 48hrs, not DNC)
 * @returns {Promise<Array>} Array of hot leads
 */
async function getHotLeads() {
  try {
    const dbId = TAX_SALE_LEADS_DB_ID || process.env.NOTION_DATABASE_ID;
    if (!dbId) {
      throw new Error('Tax Sale Leads database ID not configured');
    }

    // Calculate timestamp for 48 hours ago
    const fortyEightHoursAgo = new Date();
    fortyEightHoursAgo.setHours(fortyEightHoursAgo.getHours() - 48);
    const cutoffDate = fortyEightHoursAgo.toISOString();

    const response = await axios.post(
      `${NOTION_API_BASE}/databases/${dbId}/query`,
      {
        filter: {
          and: [
            {
              property: 'Score',
              number: {
                greater_than_or_equal_to: 80
              }
            },
            {
              or: [
                {
                  property: 'Last Contact',
                  date: {
                    is_empty: true
                  }
                },
                {
                  property: 'Last Contact',
                  date: {
                    before: cutoffDate
                  }
                }
              ]
            },
            {
              property: 'Status',
              select: {
                does_not_equal: 'DNC'
              }
            },
            {
              property: 'DNC',
              checkbox: {
                does_not_equal: true
              }
            }
          ]
        },
        sorts: [
          {
            property: 'Score',
            direction: 'descending'
          }
        ]
      },
      { headers: getHeaders() }
    );

    // Format leads for easier consumption
    const leads = response.data.results.map(page => ({
      id: page.id,
      url: page.url,
      name: page.properties.Name?.title?.[0]?.text?.content || 'Unknown',
      phone: page.properties.Phone?.phone_number || null,
      email: page.properties.Email?.email || null,
      score: page.properties.Score?.number || 0,
      temperature: page.properties.Temperature?.select?.name || 'Cold',
      status: page.properties.Status?.select?.name || 'New',
      lastContact: page.properties['Last Contact']?.date?.start || null,
      callAttempts: page.properties['Call Attempts']?.number || 0,
      propertyAddress: page.properties['Property Address']?.rich_text?.[0]?.text?.content || null,
      raw: page.properties
    }));

    return {
      success: true,
      count: leads.length,
      leads: leads
    };
  } catch (error) {
    console.error('Error fetching hot leads:', error.response?.data || error.message);
    return {
      success: false,
      error: error.response?.data || error.message,
      leads: []
    };
  }
}

/**
 * Get a single lead by ID
 * @param {string} leadId - The Notion page ID
 * @returns {Promise<Object>} Lead data
 */
async function getLead(leadId) {
  try {
    const response = await axios.get(
      `${NOTION_API_BASE}/pages/${leadId}`,
      { headers: getHeaders() }
    );

    const page = response.data;
    return {
      success: true,
      id: page.id,
      url: page.url,
      name: page.properties.Name?.title?.[0]?.text?.content || 'Unknown',
      phone: page.properties.Phone?.phone_number || null,
      email: page.properties.Email?.email || null,
      score: page.properties.Score?.number || 0,
      temperature: page.properties.Temperature?.select?.name || 'Cold',
      status: page.properties.Status?.select?.name || 'New',
      lastContact: page.properties['Last Contact']?.date?.start || null,
      callAttempts: page.properties['Call Attempts']?.number || 0,
      raw: page.properties
    };
  } catch (error) {
    console.error('Error fetching lead:', error.response?.data || error.message);
    return {
      success: false,
      error: error.response?.data || error.message
    };
  }
}

/**
 * Update DNC status for a lead
 * @param {string} leadId - The Notion page ID
 * @param {boolean} isDnc - Whether to mark as DNC
 * @returns {Promise<Object>} Updated lead
 */
async function setDncStatus(leadId, isDnc = true) {
  try {
    const properties = {
      'DNC': {
        checkbox: isDnc
      },
      'Status': {
        select: {
          name: isDnc ? 'DNC' : 'New'
        }
      }
    };

    const response = await axios.patch(
      `${NOTION_API_BASE}/pages/${leadId}`,
      { properties: properties },
      { headers: getHeaders() }
    );

    return {
      success: true,
      id: response.data.id,
      dnc: isDnc,
      data: response.data
    };
  } catch (error) {
    console.error('Error updating DNC status:', error.response?.data || error.message);
    return {
      success: false,
      error: error.response?.data || error.message
    };
  }
}

module.exports = {
  createCallRecord,
  updateLeadStatus,
  getHotLeads,
  getLead,
  setDncStatus,
  // For advanced usage
  getHeaders,
  NOTION_API_BASE
};
