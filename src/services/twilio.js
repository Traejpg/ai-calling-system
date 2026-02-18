/**
 * Twilio Integration Module
 * 
 * Handles outbound calls, webhook processing, AMD, and recording management
 * Enhanced with voicemail detection and bad number handling
 */

const twilio = require('twilio');
const axios = require('axios');
const logger = require('../utils/logger');
const { generateVoicemailTwiml, VOICEMAIL_CONFIG } = require('../../lib/voicemailDrop');

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
   * Initiate an outbound call using ElevenLabs AI agent with AMD
   * @param {string} to - Phone number to call
   * @param {string} leadId - Notion lead ID for tracking
   * @param {Object} options - Additional options (leadName, propertyAddress, skipAMD)
   * @returns {Promise<Object>} - Call details
   */
  async initiateCall(to, leadId, options = {}) {
    try {
      // Format phone number
      const formattedNumber = this.formatPhoneNumber(to);
      
      // Check if this is a retry and if the number is marked as bad
      if (options.isRetry && options.retryCount >= 2) {
        logger.warn('Skipping call to number with max retries', {
          phone: formattedNumber,
          leadId,
          retryCount: options.retryCount
        });
        return {
          success: false,
          error: 'Max retries exceeded - number marked as bad',
          isBadNumber: true
        };
      }

      logger.info('Initiating outbound call with AMD', {
        to: formattedNumber,
        leadId,
        skipAMD: options.skipAMD || false
      });

      // Build call parameters
      const callParams = {
        to: formattedNumber,
        from: this.phoneNumber,
        url: `${this.webhookBaseUrl}/twiml/voice`,
        statusCallback: `${this.webhookBaseUrl}/webhooks/twilio/status`,
        statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed', 'busy', 'no-answer', 'failed'],
        statusCallbackMethod: 'POST',
        record: true,
        recordingStatusCallback: `${this.webhookBaseUrl}/webhooks/twilio/recording`,
        recordingStatusCallbackMethod: 'POST',
        recordingStatusCallbackEvent: ['completed'],
        customParameters: {
          lead_id: leadId,
          lead_name: options.leadName || '',
          property_address: options.propertyAddress || ''
        }
      };

      // Enable AMD unless explicitly skipped
      if (!options.skipAMD) {
        callParams.machineDetection = 'DetectMessageEnd';
        callParams.asyncAmd = true;
        callParams.amdStatusCallback = `${this.webhookBaseUrl}/twiml/amd-callback`;
        callParams.amdStatusCallbackMethod = 'POST';
      }

      // Create call with ElevenLabs AI agent
      const call = await this.client.calls.create(callParams);

      logger.info(`Call initiated successfully`, {
        callSid: call.sid,
        to: formattedNumber,
        leadId: leadId,
        status: call.status,
        amdEnabled: !options.skipAMD
      });

      return {
        success: true,
        callSid: call.sid,
        status: call.status,
        uri: call.uri,
        amdEnabled: !options.skipAMD
      };

    } catch (error) {
      logger.error('Failed to initiate call', {
        error: error.message,
        to: to,
        leadId: leadId,
        errorCode: error.code
      });
      
      return {
        success: false,
        error: error.message,
        errorCode: error.code
      };
    }
  }

  /**
   * Initiate a call specifically for voicemail drop
   * @param {string} to - Phone number to call
   * @param {Object} voicemailOptions - Voicemail options
   * @returns {Promise<Object>} - Call details
   */
  async initiateVoicemailDrop(to, voicemailOptions = {}) {
    try {
      const formattedNumber = this.formatPhoneNumber(to);
      
      logger.info('Initiating voicemail drop', {
        to: formattedNumber,
        leadName: voicemailOptions.leadName
      });

      const call = await this.client.calls.create({
        to: formattedNumber,
        from: this.phoneNumber,
        url: `${this.webhookBaseUrl}/twiml/voicemail?${new URLSearchParams({
          lead_name: voicemailOptions.leadName || '',
          property_address: voicemailOptions.propertyAddress || '',
          callback_number: voicemailOptions.callbackNumber || this.phoneNumber
        }).toString()}`,
        statusCallback: `${this.webhookBaseUrl}/webhooks/twilio/status`,
        statusCallbackEvent: ['completed', 'failed'],
        statusCallbackMethod: 'POST',
        // No AMD for voicemail drops - we want to go straight to voicemail
        // We rely on the call going to the carrier's voicemail
        customParameters: {
          voicemail_drop: 'true',
          lead_id: voicemailOptions.leadId || ''
        }
      });

      logger.info(`Voicemail drop initiated`, {
        callSid: call.sid,
        to: formattedNumber
      });

      return {
        success: true,
        callSid: call.sid,
        status: call.status,
        type: 'voicemail_drop'
      };

    } catch (error) {
      logger.error('Failed to initiate voicemail drop', {
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
   * Generate TwiML for connecting to ElevenLabs AI agent
   * @param {string} leadId - Optional lead ID
   * @returns {string} - TwiML response
   */
  generateVoiceResponse(leadId = '') {
    const elevenlabsSipDomain = 'agent.elevenlabs.io';
    
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="wss://${elevenlabsSipDomain}/twilio">
      <Parameter name="agent_id" value="${this.elevenlabsAgentId}" />
      ${leadId ? `<Parameter name="lead_id" value="${leadId}" />` : ''}
    </Stream>
  </Connect>
</Response>`;

    return twiml;
  }

  /**
   * Generate TwiML for voicemail using the voicemail drop module
   * @param {Object} options - Voicemail options
   * @returns {string} - TwiML response
   */
  generateVoicemailResponse(options = {}) {
    return generateVoicemailTwiml({
      ...options,
      callbackNumber: options.callbackNumber || this.phoneNumber
    });
  }

  /**
   * Generate TwiML for AMD callback handling
   * @param {string} answeredBy - AMD result (human, machine_start, etc.)
   * @param {Object} options - Call options
   * @returns {string} - TwiML response
   */
  generateAmdResponse(answeredBy, options = {}) {
    // Machine detected - leave voicemail
    if (answeredBy === 'machine_start' || 
        answeredBy === 'machine_end_beep' || 
        answeredBy === 'machine_end_silence' ||
        answeredBy === 'machine_end_other') {
      
      logger.info('AMD detected machine - generating voicemail', { answeredBy });
      
      return generateVoicemailTwiml({
        leadName: options.leadName,
        propertyAddress: options.propertyAddress,
        callbackNumber: this.phoneNumber
      });
    }
    
    // Human detected - connect to AI agent
    logger.info('AMD detected human - connecting to AI agent', { answeredBy });
    
    return this.generateVoiceResponse(options.leadId);
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
   * @returns {Promise<Object>} - Audio buffer and metadata
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
   * Get call details including AMD results
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
          machineDetectionResult: call.machineDetectionResult,
          // Additional AMD details
          amd: {
            answeredBy: call.answeredBy,
            machineDetectionResult: call.machineDetectionResult
          }
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
   * @returns {Promise<Object>} - Array of recordings
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
    if (!number) return '';
    
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

  /**
   * Categorize call failure by error code
   * @param {string} errorCode - Twilio error code
   * @param {string} errorMessage - Error message
   * @returns {string} - Failure category
   */
  categorizeFailure(errorCode, errorMessage) {
    const code = parseInt(errorCode);
    const message = (errorMessage || '').toLowerCase();

    // Bad number / disconnected
    if (code === 13214 || // Number does not exist
        code === 21210 || // Phone number not valid
        code === 21211 || // Invalid 'To' Phone Number
        code === 21612 || // The number is unverified
        message.includes('disconnected') ||
        message.includes('not in service') ||
        message.includes('no longer in service')) {
      return 'disconnected';
    }

    // Invalid number format
    if (code === 21210 ||
        code === 21211 ||
        message.includes('invalid') ||
        message.includes('not a valid')) {
      return 'invalid';
    }

    // Busy / congestion
    if (code === 13217 || // Congestion
        code === 13221 || // Busy
        message.includes('busy') ||
        message.includes('congestion')) {
      return 'busy';
    }

    // No answer
    if (code === 13215 || // No answer
        message.includes('no answer')) {
      return 'no-answer';
    }

    return 'unknown';
  }
}

module.exports = TwilioService;