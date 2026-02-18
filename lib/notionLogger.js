/**
 * Notion Logger Module
 * Handles logging call data to Notion Call Records database
 * Links call records to Leads database
 */

const { Client } = require('@notionhq/client');

// Initialize Notion client
const notion = new Client({ auth: process.env.NOTION_TOKEN });

// Database IDs
const LEADS_DB_ID = process.env.NOTION_DATABASE_ID || '6bfe2b03-ad24-4de6-8df3-c63d01f4ad12';
const CALL_RECORDS_DB_ID = process.env.NOTION_CALLS_DB_ID; // Vault will provide this

/**
 * Find a lead by phone number
 * @param {string} phoneNumber - Phone number to search (will normalize)
 * @returns {Promise<Object|null>} Lead page object or null if not found
 */
async function findLeadByPhone(phoneNumber) {
  try {
    if (!phoneNumber) {
      console.warn('[NotionLogger] No phone number provided for lead lookup');
      return null;
    }

    // Normalize phone number (remove spaces, dashes, etc.)
    const normalizedPhone = phoneNumber.replace(/\D/g, '');
    
    console.log(`[NotionLogger] Searching for lead with phone: ${normalizedPhone}`);

    // Query Leads database for matching phone number
    const response = await notion.databases.query({
      database_id: LEADS_DB_ID,
      filter: {
        property: 'Phone',
        phone_number: {
          contains: normalizedPhone.slice(-10) // Match last 10 digits
        }
      }
    });

    if (response.results.length === 0) {
      console.log(`[NotionLogger] No lead found for phone: ${phoneNumber}`);
      return null;
    }

    const lead = response.results[0];
    console.log(`[NotionLogger] Found lead: ${lead.id}`);
    
    return {
      id: lead.id,
      name: lead.properties.Name?.title?.[0]?.text?.content || 'Unknown',
      phone: lead.properties.Phone?.phone_number,
      url: lead.url
    };
  } catch (error) {
    console.error('[NotionLogger] Error finding lead:', error.message);
    return null;
  }
}

/**
 * Create a new call record in Notion
 * @param {Object} callData - Call data from Twilio webhook
 * @param {string} callData.CallSid - Twilio Call SID
 * @param {string} callData.From - Caller phone number
 * @param {string} callData.To - Called phone number
 * @param {string} callData.Duration - Call duration in seconds
 * @param {string} callData.Status - Call status
 * @param {string} callData.Direction - Call direction (inbound/outbound)
 * @returns {Promise<Object>} Created call record result
 */
async function createCallRecord(callData) {
  try {
    if (!CALL_RECORDS_DB_ID) {
      throw new Error('NOTION_CALLS_DB_ID environment variable not set');
    }

    const {
      CallSid,
      From,
      To,
      Duration,
      Status,
      Direction
    } = callData;

    console.log(`[NotionLogger] Creating call record for: ${CallSid}`);

    // Find associated lead
    const lead = await findLeadByPhone(From);

    // Build properties object
    const properties = {
      'Call SID': {
        title: [{ text: { content: CallSid } }]
      },
      'From': {
        phone_number: From || 'Unknown'
      },
      'To': {
        phone_number: To || 'Unknown'
      },
      'Duration': {
        number: parseInt(Duration, 10) || 0
      },
      'Status': {
        select: { name: Status || 'unknown' }
      },
      'Direction': {
        select: { name: Direction || 'outbound' }
      },
      'Call Date': {
        date: { start: new Date().toISOString() }
      }
    };

    // Add relation to Lead if found
    if (lead) {
      properties['Lead'] = {
        relation: [{ id: lead.id }]
      };
      properties['Lead Name'] = {
        rich_text: [{ text: { content: lead.name } }]
      };
    }

    const response = await notion.pages.create({
      parent: { database_id: CALL_RECORDS_DB_ID },
      properties: properties
    });

    console.log(`[NotionLogger] Call record created: ${response.id}`);

    return {
      success: true,
      id: response.id,
      url: response.url,
      leadId: lead?.id || null
    };
  } catch (error) {
    console.error('[NotionLogger] Error creating call record:', error.message);
    return {
      success: false,
      error: error.message,
      callSid: callData.CallSid
    };
  }
}

/**
 * Update an existing call record in Notion
 * Searches by Call SID to find the record
 * @param {string} callSid - Twilio Call SID to search for
 * @param {Object} updates - Updates to apply
 * @param {string} updates.recordingUrl - Recording URL
 * @param {string} updates.transcript - Call transcript
 * @param {string} updates.recordingStatus - Recording processing status
 * @param {string} updates.notes - Additional notes
 * @returns {Promise<Object>} Update result
 */
async function updateCallRecord(callSid, updates) {
  try {
    if (!CALL_RECORDS_DB_ID) {
      throw new Error('NOTION_CALLS_DB_ID environment variable not set');
    }

    if (!callSid) {
      throw new Error('Call SID is required');
    }

    console.log(`[NotionLogger] Updating call record: ${callSid}`);

    // Find the call record by Call SID
    const searchResponse = await notion.databases.query({
      database_id: CALL_RECORDS_DB_ID,
      filter: {
        property: 'Call SID',
        title: {
          equals: callSid
        }
      }
    });

    if (searchResponse.results.length === 0) {
      console.warn(`[NotionLogger] Call record not found for SID: ${callSid}`);
      return {
        success: false,
        error: 'Call record not found',
        callSid
      };
    }

    const pageId = searchResponse.results[0].id;

    // Build update properties
    const properties = {};

    if (updates.recordingUrl) {
      properties['Recording URL'] = {
        url: updates.recordingUrl
      };
    }

    if (updates.transcript) {
      properties['Transcript'] = {
        rich_text: [{ 
          text: { content: updates.transcript.substring(0, 2000) } // Notion limit
        }]
      };
    }

    if (updates.recordingStatus) {
      properties['Recording Status'] = {
        select: { name: updates.recordingStatus }
      };
    }

    if (updates.notes) {
      // Append to existing notes or create new
      const existingNotes = searchResponse.results[0].properties.Notes?.rich_text?.[0]?.text?.content || '';
      properties['Notes'] = {
        rich_text: [{ 
          text: { content: existingNotes ? `${existingNotes}\n${updates.notes}` : updates.notes }
        }]
      };
    }

    const response = await notion.pages.update({
      page_id: pageId,
      properties: properties
    });

    console.log(`[NotionLogger] Call record updated: ${response.id}`);

    return {
      success: true,
      id: response.id,
      url: response.url,
      callSid
    };
  } catch (error) {
    console.error('[NotionLogger] Error updating call record:', error.message);
    return {
      success: false,
      error: error.message,
      callSid
    };
  }
}

/**
 * Get call record by Call SID
 * @param {string} callSid - Twilio Call SID
 * @returns {Promise<Object|null>} Call record or null
 */
async function getCallRecord(callSid) {
  try {
    if (!CALL_RECORDS_DB_ID || !callSid) {
      return null;
    }

    const response = await notion.databases.query({
      database_id: CALL_RECORDS_DB_ID,
      filter: {
        property: 'Call SID',
        title: { equals: callSid }
      }
    });

    if (response.results.length === 0) {
      return null;
    }

    const record = response.results[0];
    return {
      id: record.id,
      callSid: record.properties['Call SID']?.title?.[0]?.text?.content,
      from: record.properties['From']?.phone_number,
      to: record.properties['To']?.phone_number,
      duration: record.properties['Duration']?.number,
      status: record.properties['Status']?.select?.name,
      url: record.url
    };
  } catch (error) {
    console.error('[NotionLogger] Error getting call record:', error.message);
    return null;
  }
}

module.exports = {
  createCallRecord,
  updateCallRecord,
  findLeadByPhone,
  getCallRecord
};
