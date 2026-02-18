/**
 * Twilio Integration Module
 * 
 * Handles outbound calls, webhook processing, and recording management
 */

const twilio = require('twilio');
const axios = require('axios');
const logger = require('../utils/logger');

class TwilioService {
  constructor() {
    this.accountSid = process.env.TWILIO_ACCOUNT_SID;
    this.authToken = process.env.TWILIO_AUTH_TOKEN;
    this.phoneNumber = process.env.TWILIO_PHONE_NUMBER;
    this.webhookBaseUrl = process.env.WEBHOOK_BASE_URL;
    this.elevenlabsAgentId = process.env.ELEVENLABS_AGENT_ID;
    
    this.client = twilio(this.accountSid, this.authToken);
  }

  /**
   * Initiate an outbound call using ElevenLabs AI agent
   * @param {string} to - Phone number to call
   * @param {string} leadId - Notion lead ID for tracking
   * @returns {Promise<Object>} - Call details
   */
  async initiateCall(to, leadId) {
    try {
      // Format phone number
      const formattedNumber = this.formatPhoneNumber(to);
      
      // Create call with ElevenLabs AI agent
      const call = await this.client.calls.create({
        to: formattedNumber,
        from: this.phoneNumber,
        url: `${this.webhookBaseUrl}/webhooks/twilio/voice`,
        statusCallback: `${this.webhookBaseUrl}/webhooks/twilio/status`,
        statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed', 'busy', 'no-answer', 'failed'],
        statusCallbackMethod: 'POST',
        record: true,
        recordingStatusCallback: `${this.webhookBaseUrl}/webhooks/twilio/recording`,
        recordingStatusCallbackMethod: 'POST',
        recordingStatusCallbackEvent: ['completed'],
        machineDetection: 'DetectMessageEnd', // Leave voicemail if machine
        asyncAmd: true,
        customParameters: {
          lead_id: leadId
        }
      });

      logger.info(`Call initiated`, {
        callSid: call.sid,
        to: formattedNumber,
        leadId: leadId,
        status: call.status
      });

      return {
        success: true,
        callSid: call.sid,
        status: call.status,
        uri: call.uri
      };

    } catch (error) {
      logger.error('Failed to initiate call', {
        error: error.message,
        to: to,
        leadId: leadId
      });
      
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Generate TwiML for connecting to ElevenLabs AI agent
   * @returns {string} - TwiML response
   */
  generateVoiceResponse() {
    // Using ElevenLabs AI agent for conversation
    const elevenlabsSipDomain = 'agent.elevenlabs.io';
    
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="wss://${elevenlabsSipDomain}/twilio">
      <Parameter name="agent_id" value="${this.elevenlabsAgentId}" />
    </Stream>
  </Connect>
</Response>`;

    return twiml;
  }

  /**
   * Generate TwiML for voicemail
   * @returns {string} - TwiML response
   */
  generateVoicemailResponse() {
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Matthew">
    Hi, this is Alex with Windy City Home Buyers. I'm calling about a property you own in Chicago. 
    We buy houses in any condition for cash, and I wanted to see if you might be interested in a 
    no-obligation offer. Give me a call back at ${this.phoneNumber}. Again, that's ${this.phoneNumber}. 
    Thanks and have a great day!
  </Say>
  <Hangup />
</Response>`;

    return twiml;
  }

  /**
   * Validate Twilio webhook signature
   * @param {string} url - Full URL of the request
   * @param {Object} params - Request body parameters
   * @param {string} signature - X-Twilio-Signature header
   * @returns {boolean} - Valid signature
   */
  validateWebhook(url, params, signature) {
    const authToken = this.authToken;
    return twilio.validateRequest(authToken, signature, url, params);
  }

  /**
   * Fetch recording from Twilio
   * @param {string} recordingSid - Twilio recording SID
   * @returns {Promise<Buffer>} - Audio buffer
   */
  async fetchRecording(recordingSid) {
    try {
      const recording = await this.client.recordings(recordingSid).fetch();
      const recordingUrl = `https://api.twilio.com${recording.uri.replace('.json', '.mp3')}`;
      
      const response = await axios.get(recordingUrl, {
        auth: {
          username: this.accountSid,
          password: this.authToken
        },
        responseType: 'arraybuffer'
      });

      logger.info(`Recording fetched`, {
        recordingSid: recordingSid,
        duration: recording.duration,
        size: response.data.length
      });

      return {
        success: true,
        buffer: Buffer.from(response.data),
        duration: parseInt(recording.duration),
        format: 'mp3'
      };

    } catch (error) {
      logger.error('Failed to fetch recording', {
        recordingSid: recordingSid,
        error: error.message
      });
      
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Delete a recording from Twilio
   * @param {string} recordingSid - Twilio recording SID
   */
  async deleteRecording(recordingSid) {
    try {
      await this.client.recordings(recordingSid).remove();
      logger.info(`Recording deleted`, { recordingSid });
      return { success: true };
    } catch (error) {
      logger.error('Failed to delete recording', {
        recordingSid: recordingSid,
        error: error.message
      });
      return { success: false, error: error.message };
    }
  }

  /**
   * Send SMS alert
   * @param {string} to - Phone number to send to
   * @param {string} message - Message body
   * @returns {Promise<Object>} - SMS details
   */
  async sendSMS(to, message) {
    try {
      const formattedNumber = this.formatPhoneNumber(to);
      
      const sms = await this.client.messages.create({
        to: formattedNumber,
        from: this.phoneNumber,
        body: message
      });

      logger.info(`SMS sent`, {
        messageSid: sms.sid,
        to: formattedNumber,
        status: sms.status
      });

      return {
        success: true,
        messageSid: sms.sid,
        status: sms.status
      };

    } catch (error) {
      logger.error('Failed to send SMS', {
        error: error.message,
        to: to
      });
      
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get call details
   * @param {string} callSid - Twilio call SID
   * @returns {Promise<Object>} - Call details
   */
  async getCallDetails(callSid) {
    try {
      const call = await this.client.calls(callSid).fetch();
      return {
        success: true,
        call: {
          sid: call.sid,
          status: call.status,
          duration: call.duration,
          from: call.from,
          to: call.to,
          startTime: call.startTime,
          endTime: call.endTime,
          price: call.price,
          direction: call.direction,
          answeredBy: call.answeredBy,
          machineDetectionResult: call.machineDetectionResult
        }
      };
    } catch (error) {
      logger.error('Failed to get call details', {
        callSid: callSid,
        error: error.message
      });
      
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get recordings for a call
   * @param {string} callSid - Twilio call SID
   * @returns {Promise<Array>} - Array of recordings
   */
  async getCallRecordings(callSid) {
    try {
      const recordings = await this.client.recordings.list({
        callSid: callSid,
        limit: 10
      });

      return {
        success: true,
        recordings: recordings.map(r => ({
          sid: r.sid,
          duration: r.duration,
          dateCreated: r.dateCreated,
          format: r.format
        }))
      };
    } catch (error) {
      logger.error('Failed to get call recordings', {
        callSid: callSid,
        error: error.message
      });
      
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Format phone number to E.164
   * @param {string} number - Phone number
   * @returns {string} - Formatted number
   */
  formatPhoneNumber(number) {
    // Remove all non-numeric characters
    let cleaned = number.replace(/\D/g, '');
    
    // Add US country code if not present
    if (cleaned.length === 10) {
      cleaned = '1' + cleaned;
    }
    
    return '+' + cleaned;
  }

  /**
   * Check if we're within business hours
   * @returns {boolean}
   */
  isBusinessHours() {
    const timezone = process.env.TIMEZONE || 'America/Chicago';
    const startHour = parseInt(process.env.BUSINESS_HOURS_START) || 9;
    const endHour = parseInt(process.env.BUSINESS_HOURS_END) || 18;
    
    const now = new Date().toLocaleString('en-US', { 
      timeZone: timezone,
      hour12: false,
      hour: 'numeric',
      weekday: 'short'
    });
    
    const hour = parseInt(now.split(':')[0]);
    const day = now.split(',')[0];
    
    // Skip weekends
    if (day === 'Sat' || day === 'Sun') {
      return false;
    }
    
    return hour >= startHour && hour < endHour;
  }
}

module.exports = TwilioService;