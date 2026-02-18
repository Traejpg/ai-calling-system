/**
 * ElevenLabs Custom Tool: Transfer Call via Twilio
 * 
 * This tool creates a conference call and adds both the lead
 * and the agent (Batman) to it, enabling warm transfer.
 */

const twilio = require('twilio');

// Twilio credentials
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const twilioNumber = process.env.TWILIO_PHONE_NUMBER; // +17739852082
const agentNumber = process.env.AGENT_PHONE_NUMBER; // +12133351297 (Batman)

const client = twilio(accountSid, authToken);

/**
 * Transfer call to human agent via conference
 * @param {Object} params - Transfer parameters from ElevenLabs
 */
async function transferToAgent(params) {
  const {
    call_sid,           // Current Twilio call SID
    lead_name,          // Lead name
    property_address,   // Property address
    lead_phone,         // Lead phone number
    transfer_reason     // Why transfer (hot lead, needs human, etc.)
  } = params;

  try {
    console.log('🔥 Hot lead detected - initiating transfer...');
    console.log(`   Lead: ${lead_name} (${lead_phone})`);
    console.log(`   Property: ${property_address}`);

    // Create unique conference room name
    const conferenceName = `Transfer-${call_sid}-${Date.now()}`;

    // Step 1: Update current call to join conference
    // This puts the lead into the conference room
    await client.calls(call_sid).update({
      twiml: `
        <Response>
          <Say>Please hold while I connect you with my acquisition manager.</Say>
          <Dial>
            <Conference 
              startConferenceOnEnter="true"
              endConferenceOnExit="false"
              waitUrl="https://ai-calling-system-3r2c.onrender.com/twiml/hold-music"
            >${conferenceName}</Conference>
          </Dial>
        </Response>
      `
    });

    // Step 2: Call the agent (Batman) and add to same conference
    const agentCall = await client.calls.create({
      to: agentNumber,
      from: twilioNumber,
      twiml: `
        <Response>
          <Say voice="Polly.Joanna">Incoming hot lead transfer.</Say>
          <Say voice="Polly.Joanna">Lead: ${lead_name}</Say>
          <Say voice="Polly.Joanna">Property: ${property_address}</Say>
          <Say voice="Polly.Joanna">Connecting now.</Say>
          <Dial>
            <Conference 
              startConferenceOnEnter="true"
              endConferenceOnExit="true"
            >${conferenceName}</Conference>
          </Dial>
        </Response>
      `,
      timeout: 30  // 30 seconds to answer
    });

    console.log('✅ Transfer initiated successfully');
    console.log(`   Conference: ${conferenceName}`);
    console.log(`   Agent call SID: ${agentCall.sid}`);

    return {
      success: true,
      message: `Transferring ${lead_name} to acquisition manager`,
      conference_name: conferenceName,
      agent_call_sid: agentCall.sid
    };

  } catch (error) {
    console.error('❌ Transfer failed:', error.message);
    
    // Fallback: schedule callback
    return {
      success: false,
      message: 'Transfer failed - scheduling callback instead',
      error: error.message,
      fallback_action: 'schedule_callback'
    };
  }
}

module.exports = { transferToAgent };