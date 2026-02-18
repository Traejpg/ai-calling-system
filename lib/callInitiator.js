/**
 * Call Initiator Module - ElevenLabs API Version
 * Uses ElevenLabs API to initiate outbound calls (ElevenLabs controls the Twilio number)
 */

const axios = require('axios');

// ElevenLabs configuration
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_AGENT_ID = process.env.ELEVENLABS_AGENT_ID || 'agent_7101khptjkheeaws4azxfaep9gj1';
const ELEVENLABS_PHONE_NUMBER_ID = process.env.ELEVENLABS_PHONE_NUMBER_ID || 'phnum_5301khq5n6q9ef0amsse9k2djg14';

/**
 * Initiates an outbound call via ElevenLabs API
 * ElevenLabs controls the Twilio number and handles the call
 * 
 * @param {string} leadPhone - The phone number to call (E.164 format preferred)
 * @param {string} leadName - Name of the lead being called (for agent context)
 * @param {string} leadAddress - Address of the property/lead (for agent context)
 * @returns {Promise<string>} - The call ID
 * @throws {Error} - If call initiation fails
 */
async function initiateCall(leadPhone, leadName, leadAddress) {
  // Validate environment variables
  if (!ELEVENLABS_API_KEY) {
    throw new Error('ELEVENLABS_API_KEY not configured. Set ELEVENLABS_API_KEY environment variable.');
  }

  if (!ELEVENLABS_PHONE_NUMBER_ID) {
    throw new Error('ELEVENLABS_PHONE_NUMBER_ID not configured. Set ELEVENLABS_PHONE_NUMBER_ID environment variable.');
  }

  // Validate inputs
  if (!leadPhone) {
    throw new Error('Lead phone number is required');
  }

  // Format the phone number if needed (ensure E.164 format)
  const formattedPhone = formatPhoneNumber(leadPhone);

  try {
    console.log('📞 Initiating outbound call via ElevenLabs API...');
    console.log(`   To: ${formattedPhone}`);
    console.log(`   From Phone ID: ${ELEVENLABS_PHONE_NUMBER_ID}`);
    console.log(`   Agent: ${ELEVENLABS_AGENT_ID}`);

    // Make request to ElevenLabs outbound call API (Twilio endpoint)
    const response = await axios.post(
      'https://api.elevenlabs.io/v1/convai/twilio/outbound-call',
      {
        agent_id: ELEVENLABS_AGENT_ID,
        agent_phone_number_id: ELEVENLABS_PHONE_NUMBER_ID,
        to_number: formattedPhone,
        // Optional: pass custom data to agent
        conversation_initiation_client_data: {
          custom_variables: {
            lead_name: leadName || 'Unknown',
            lead_address: leadAddress || 'Unknown',
            lead_phone: formattedPhone
          }
        }
      },
      {
        headers: {
          'xi-api-key': ELEVENLABS_API_KEY,
          'Content-Type': 'application/json'
        }
      }
    );

    const callId = response.data.call_id;
    
    console.log(`✅ Call initiated successfully`);
    console.log(`   Call ID: ${callId}`);
    console.log(`   To: ${formattedPhone}`);

    return callId;

  } catch (error) {
    console.error('❌ Failed to initiate call:', error.message);
    if (error.response) {
      console.error('   API Error:', error.response.data);
    }
    throw new Error(`Call initiation failed: ${error.message}`);
  }
}

/**
 * Check the status of a call
 * Note: ElevenLabs doesn't have a direct status endpoint, 
 * so we check Twilio for call status
 * 
 * @param {string} callSid - The Twilio Call SID (from webhook)
 * @returns {Promise<Object>} - Call status information
 */
async function getCallStatus(callSid) {
  // For ElevenLabs calls, we need to check Twilio since ElevenLabs uses Twilio
  const twilio = require('twilio');
  const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  
  try {
    const call = await client.calls(callSid).fetch();
    return {
      sid: call.sid,
      status: call.status,
      duration: call.duration,
      direction: call.direction,
      from: call.from,
      to: call.to,
      startTime: call.startTime,
      endTime: call.endTime
    };
  } catch (error) {
    throw new Error(`Failed to fetch call status: ${error.message}`);
  }
}

/**
 * Formats a phone number to E.164 format
 * 
 * @param {string} phone - Raw phone number
 * @returns {string} - Formatted E.164 phone number
 */
function formatPhoneNumber(phone) {
  // Remove all non-digit characters
  let digits = phone.replace(/\D/g, '');
  
  // If number starts with 1 and has 11 digits, it's already in E.164 (US)
  if (digits.length === 11 && digits.startsWith('1')) {
    return `+${digits}`;
  }
  
  // If number has 10 digits, assume US number and add +1
  if (digits.length === 10) {
    return `+1${digits}`;
  }
  
  // If already has +, return as-is
  if (phone.startsWith('+')) {
    return phone;
  }
  
  // Otherwise, add + prefix
  return `+${digits}`;
}

module.exports = {
  initiateCall,
  getCallStatus,
  formatPhoneNumber
};
