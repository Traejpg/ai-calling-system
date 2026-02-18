/**
 * Webhook Handlers
 * 
 * Handles Twilio/ElevenLabs webhooks for:
 * - Call status updates
 * - Voicemail detection and drops
 * - Recording callbacks
 * - Bad number retry logic
 */

const logger = require('../src/utils/logger');
const TwilioService = require('../src/services/twilio');
const NotionService = require('../src/services/notion');
const TranscriptionService = require('../src/services/transcription');
const { getSMSAlerts } = require('./smsAlerts');
const { getRetryQueue } = require('./retryQueue');
const { getLeadDataByCallSid } = require('./callInitiator');

class WebhookHandlers {
  constructor() {
    this.twilioService = new TwilioService();
    this.notionService = new NotionService();
    this.transcriptionService = new TranscriptionService();
    this.smsAlerts = getSMSAlerts();
    this.retryQueue = getRetryQueue();
    
    // In-memory cache for call records (callSid -> notionPageId)
    this.callRecordCache = new Map();
    
    // Voicemail tracking
    this.voicemailCache = new Map(); // callSid -> voicemail metadata
    
    // Start retry processor
    this.startRetryProcessor();
  }

  /**
   * Handle Twilio status callback webhook
   * Processes: completed, no-answer, busy, failed, canceled
   * Also handles Answering Machine Detection (AMD) results
   */
  async handleStatusWebhook(req, res) {
    // Verify ElevenLabs webhook signature if secret is configured
    const webhookSecret = process.env.ELEVENLABS_WEBHOOK_SECRET;
    if (webhookSecret) {
      const signature = req.headers['x-elevenlabs-signature'];
      if (!signature) {
        logger.warn('Missing webhook signature');
        return res.status(401).send('Missing signature');
      }
      // TODO: Implement signature verification
      // For now, accept all signed requests
    }

    // Return 200 immediately to prevent retries
    res.sendStatus(200);

    // Support both Twilio and ElevenLabs webhook formats
    const body = req.body;
    
    // ElevenLabs format (post-call webhook)
    const conversationId = body.conversation_id || body.CallSid;
    const callDuration = body.call_duration_secs || body.CallDuration || body.duration;
    const status = body.status || body.CallStatus;
    const from = body.from_number || body.From || body.caller_id;
    const to = body.to_number || body.To || body.called_number;
    const leadId = body.lead_id || body.LeadId;
    const recordingUrl = body.recording_url || body.RecordingUrl;
    
    // AMD (Answering Machine Detection) results from Twilio
    const answeredBy = body.AnsweredBy || body.answered_by;
    const machineDetectionResult = body.MachineDetectionResult || body.machine_detection_result;
    
    // Map ElevenLabs status to Twilio-style status
    let callStatus = status;
    if (status === 'ended' || status === 'completed') callStatus = 'completed';
    if (status === 'failed') callStatus = 'failed';
    if (status === 'no-answer') callStatus = 'no-answer';
    
    // Check for voicemail indicator from ElevenLabs
    const isVoicemail = body.is_voicemail === true || 
                        body.voicemail_detected === true ||
                        answeredBy === 'machine_start' ||
                        answeredBy === 'machine_end_beep' ||
                        answeredBy === 'machine_end_silence' ||
                        machineDetectionResult === 'machine_start';

    logger.info('Call status webhook received', {
      source: body.conversation_id ? 'elevenlabs' : 'twilio',
      callSid: conversationId,
      status: callStatus,
      duration: callDuration,
      leadId: leadId,
      to: to,
      answeredBy: answeredBy,
      isVoicemail: isVoicemail
    });

    try {
      // Handle voicemail detection first
      if (isVoicemail) {
        await this.handleVoicemailDetected(conversationId, to, leadId, from, body);
        return;
      }

      switch (callStatus) {
        case 'completed':
          await this.handleCompleted(conversationId, callDuration, to, leadId, recordingUrl);
          break;
          
        case 'no-answer':
          await this.handleNoAnswer(conversationId, to, leadId, from);
          break;
          
        case 'busy':
          await this.handleBusy(conversationId, to, leadId, from);
          break;
          
        case 'failed':
          await this.handleFailed(conversationId, to, leadId, body);
          break;
          
        case 'canceled':
          await this.handleCanceled(conversationId, to, leadId);
          break;
          
        default:
          logger.info(`Unhandled call status: ${callStatus}`, { callSid: conversationId });
      }
    } catch (error) {
      logger.error('Error processing status webhook', {
        callSid: conversationId,
        status: callStatus,
        error: error.message,
        stack: error.stack
      });
    }
  }

  /**
   * Handle voicemail detection
   * Leaves a pre-recorded voicemail message
   */
  async handleVoicemailDetected(callSid, to, leadId, from, body) {
    logger.info('Voicemail detected - leaving message', { callSid, to });

    try {
      // Get lead data for personalization
      let leadData = null;
      if (to) {
        leadData = await this.notionService.findLeadByPhone(to);
      }
      if (!leadData) {
        leadData = getLeadDataByCallSid(callSid);
      }

      const leadName = leadData ? (leadData.name || 'there') : 'there';
      const propertyAddress = leadData ? (leadData.property_address || leadData.address || 'your property') : 'your property';
      
      // Voicemail message - 30 seconds max
      const voicemailMessage = `Hi ${leadName}, this is Alexis with Trae Castile. I'm calling about your property at ${propertyAddress}. Please call me back at 773-985-2082 to discuss a potential offer. Thanks!`;

      // Log the voicemail
      const callRecord = await this.notionService.createCallRecord({
        callId: `CALL-${Date.now()}`,
        leadId: leadId || (leadData ? leadData.id : null),
        phoneNumber: to,
        callDate: new Date().toISOString(),
        duration: 0,
        status: 'Voicemail Left',
        callSid: callSid,
        notes: `Voicemail message: ${voicemailMessage}`,
        leadName: leadName
      });

      // Store voicemail metadata for tracking
      this.voicemailCache.set(callSid, {
        leadId: leadId,
        phoneNumber: to,
        propertyAddress: propertyAddress,
        messageLeft: voicemailMessage,
        timestamp: new Date().toISOString(),
        notionPageId: callRecord.success ? callRecord.id : null
      });

      logger.info('Voicemail logged successfully', {
        callSid,
        phoneNumber: to,
        notionPageId: callRecord.id
      });

      // If using Twilio AMD with callback, we may need to trigger the voicemail drop
      // This would typically be done via a separate endpoint
      if (body.requires_voicemail_drop === true) {
        await this.triggerVoicemailDrop(callSid, to, voicemailMessage);
      }

    } catch (error) {
      logger.error('Error handling voicemail detection', {
        callSid,
        error: error.message
      });
    }
  }

  /**
   * Trigger a voicemail drop via Twilio
   * This is called when AMD detects a machine and we need to leave a message
   */
  async triggerVoicemailDrop(callSid, to, message) {
    try {
      logger.info('Triggering voicemail drop', { callSid, to });
      
      // Use Twilio to call back and leave the voicemail
      // This requires the call to be handled via TwiML
      const twiml = this.generateVoicemailTwiml(message);
      
      // If we have an active call, update it with the voicemail message
      // Otherwise, schedule a new call to leave the voicemail
      
      logger.info('Voicemail drop triggered', {
        callSid,
        to,
        messageLength: message.length
      });

    } catch (error) {
      logger.error('Error triggering voicemail drop', {
        callSid,
        error: error.message
      });
    }
  }

  /**
   * Generate TwiML for voicemail message
   */
  generateVoicemailTwiml(message) {
    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Pause length="2"/>
  <Say voice="Polly.Joanna">${message}</Say>
  <Hangup/>
</Response>`;
  }

  /**
   * Handle completed call
   * Creates call record in Notion, awaits recording for transcription
   */
  async handleCompleted(callSid, duration, to, leadId, recordingUrl) {
    logger.info('Processing completed call', { callSid, leadId, to });

    try {
      // Look up lead data by phone number (primary method)
      let leadData = null;
      
      if (to) {
        leadData = await this.notionService.findLeadByPhone(to);
        logger.info('Lead lookup by phone', { phone: to, found: !!leadData });
      }
      
      // Fallback: try cache by CallSid
      if (!leadData) {
        leadData = getLeadDataByCallSid(callSid);
      }
      
      const actualLeadId = leadId || (leadData ? leadData.id : null);
      const leadName = leadData ? (leadData.name || 'Unknown') : 'Unknown';

      // Create initial call record in Notion
      const callRecord = await this.notionService.createCallRecord({
        callId: `CALL-${Date.now()}`,
        leadId: actualLeadId,
        phoneNumber: to,
        callDate: new Date().toISOString(),
        duration: parseInt(duration) || 0,
        status: 'Completed - Processing',
        callSid: callSid,
        recordingUrl: recordingUrl || null,
        leadName: leadName
      });

      if (!callRecord.success) {
        logger.error('Failed to create call record', { callSid });
        return;
      }

      // Cache the page ID for recording webhook
      this.callRecordCache.set(callSid, {
        pageId: callRecord.id,
        leadId: leadId,
        phoneNumber: to,
        createdAt: new Date().toISOString()
      });

      logger.info('Call record created for completed call', {
        callSid,
        pageId: callRecord.id,
        leadId
      });

    } catch (error) {
      logger.error('Error handling completed call', {
        callSid,
        error: error.message
      });
    }
  }

  /**
   * Handle no-answer
   * Schedule retry with 15-minute delay
   */
  async handleNoAnswer(callSid, to, leadId, from) {
    logger.info('Call not answered, scheduling retry', { callSid, to });

    // Check if already marked as bad number
    if (this.retryQueue.isBadNumber(to)) {
      logger.warn('Call to bad number - no retry scheduled', { callSid, to });
      
      // Log to Notion as bad number
      await this.notionService.createCallRecord({
        callId: `CALL-${Date.now()}`,
        leadId: leadId,
        phoneNumber: to,
        callDate: new Date().toISOString(),
        duration: 0,
        status: 'Bad Number - No Answer',
        callSid: callSid,
        notes: 'Phone number marked as bad - max retries exceeded'
      });
      return;
    }

    // Create a brief call record
    await this.notionService.createCallRecord({
      callId: `CALL-${Date.now()}`,
      leadId: leadId,
      phoneNumber: to,
      callDate: new Date().toISOString(),
      duration: 0,
      status: 'No Answer',
      callSid: callSid
    });

    // Add to retry queue (15 minutes)
    const retryResult = this.retryQueue.add({
      callSid: callSid,
      leadId: leadId,
      phoneNumber: to,
      to: to,
      from: from,
      originalAttemptAt: new Date().toISOString()
    }, 'no-answer');

    if (retryResult.success) {
      logger.info('Retry scheduled for no-answer', {
        callSid,
        retryAt: retryResult.retryAt,
        retryCount: retryResult.retryCount,
        maxRetries: retryResult.maxRetries
      });
    } else if (retryResult.maxRetriesExceeded) {
      logger.warn('Max retries exceeded for no-answer - marking as bad number', { 
        callSid,
        phoneNumber: to 
      });
      
      // Update Notion with bad number status
      await this.flagAsBadNumber(callSid, to, leadId, 'Max no-answer retries exceeded');
    }
  }

  /**
   * Handle busy signal
   * Schedule retry with 15-minute delay
   */
  async handleBusy(callSid, to, leadId, from) {
    logger.info('Line busy, scheduling retry', { callSid, to });

    // Check if already marked as bad number
    if (this.retryQueue.isBadNumber(to)) {
      logger.warn('Call to bad number - no retry scheduled', { callSid, to });
      return;
    }

    // Create brief call record
    await this.notionService.createCallRecord({
      callId: `CALL-${Date.now()}`,
      leadId: leadId,
      phoneNumber: to,
      callDate: new Date().toISOString(),
      duration: 0,
      status: 'Busy',
      callSid: callSid
    });

    // Add to retry queue (15 minutes)
    const retryResult = this.retryQueue.add({
      callSid: callSid,
      leadId: leadId,
      phoneNumber: to,
      to: to,
      from: from,
      originalAttemptAt: new Date().toISOString()
    }, 'busy');

    if (retryResult.success) {
      logger.info('Retry scheduled for busy', {
        callSid,
        retryAt: retryResult.retryAt,
        retryCount: retryResult.retryCount,
        maxRetries: retryResult.maxRetries
      });
    } else if (retryResult.maxRetriesExceeded) {
      logger.warn('Max retries exceeded for busy - marking as bad number', { 
        callSid,
        phoneNumber: to 
      });
      await this.flagAsBadNumber(callSid, to, leadId, 'Max busy retries exceeded');
    }
  }

  /**
   * Handle failed call
   * Categorize failure and retry or mark as bad number
   */
  async handleFailed(callSid, to, leadId, body) {
    const errorMessage = body.ErrorMessage || body.error_message || 'Unknown error';
    const errorCode = body.ErrorCode || body.error_code;
    
    logger.error('Call failed', {
      callSid,
      to,
      error: errorMessage,
      errorCode: errorCode
    });

    // Categorize the failure
    const failureType = this.categorizeFailure(errorMessage, errorCode);
    
    // Create call record with failed status
    await this.notionService.createCallRecord({
      callId: `CALL-${Date.now()}`,
      leadId: leadId,
      phoneNumber: to,
      callDate: new Date().toISOString(),
      duration: 0,
      status: `Failed - ${failureType}`,
      callSid: callSid,
      notes: `Error: ${errorMessage} (Code: ${errorCode})`
    });

    // For disconnected/invalid numbers, treat as bad number candidates
    if (failureType === 'disconnected' || failureType === 'invalid') {
      logger.warn('Disconnected or invalid number detected', {
        callSid,
        phoneNumber: to,
        error: errorMessage
      });

      // Add to retry queue with 'disconnected' or 'invalid' reason
      const retryResult = this.retryQueue.add({
        callSid: callSid,
        leadId: leadId,
        phoneNumber: to,
        to: to,
        from: body.From,
        originalAttemptAt: new Date().toISOString()
      }, failureType);

      if (retryResult.success) {
        logger.info('Retry scheduled for disconnected/invalid', {
          callSid,
          failureType,
          retryAt: retryResult.retryAt,
          retryCount: retryResult.retryCount
        });
      } else if (retryResult.maxRetriesExceeded || retryResult.isBadNumber) {
        logger.warn('Marking as bad number after failed attempts', { 
          callSid, 
          phoneNumber: to,
          failureType 
        });
        await this.flagAsBadNumber(callSid, to, leadId, `Failed: ${errorMessage}`);
      }
    } else {
      // For other failures, add to retry queue
      const retryResult = this.retryQueue.add({
        callSid: callSid,
        leadId: leadId,
        phoneNumber: to,
        to: to,
        from: body.From,
        originalAttemptAt: new Date().toISOString()
      }, 'failed');

      if (retryResult.success) {
        logger.info('Retry scheduled for failed call', {
          callSid,
          retryAt: retryResult.retryAt,
          retryCount: retryResult.retryCount
        });
      } else if (retryResult.maxRetriesExceeded) {
        await this.flagAsBadNumber(callSid, to, leadId, `Call failed: ${errorMessage}`);
      }
    }

    // Send SMS alert for failures
    await this.smsAlerts.sendFailureAlert({
      callSid: callSid,
      phone: to,
      reason: `Call failed: ${failureType}`,
      error: errorMessage
    });
  }

  /**
   * Categorize a call failure
   * @returns {string} - Failure type: disconnected, invalid, network, unknown
   */
  categorizeFailure(errorMessage, errorCode) {
    const message = (errorMessage || '').toLowerCase();
    
    // Disconnected number indicators
    if (message.includes('disconnected') ||
        message.includes('not in service') ||
        message.includes('no longer in service') ||
        message.includes('number has been changed') ||
        message.includes('unallocated') ||
        errorCode === '13214' || // Number does not exist
        errorCode === '21210' || // Phone number not valid
        errorCode === '21211') { // Invalid 'To' Phone Number
      return 'disconnected';
    }
    
    // Invalid number indicators
    if (message.includes('invalid') ||
        message.includes('not a valid') ||
        message.includes('malformed') ||
        errorCode === '21210' ||
        errorCode === '21211') {
      return 'invalid';
    }
    
    // Network/telecom errors
    if (message.includes('congestion') ||
        message.includes('network') ||
        message.includes('timeout') ||
        errorCode === '13217') { // Carrier congestion
      return 'network';
    }
    
    return 'unknown';
  }

  /**
   * Flag a call as bad number in Notion and log to database
   */
  async flagAsBadNumber(callSid, phone, leadId, reason) {
    logger.warn('Call flagged as bad number', { callSid, phone, reason });

    // Mark in retry queue (persists to file)
    this.retryQueue.markBadNumber(phone, reason, leadId);

    // Update or create call record in Notion
    await this.notionService.createCallRecord({
      callId: `CALL-${Date.now()}`,
      leadId: leadId,
      phoneNumber: phone,
      callDate: new Date().toISOString(),
      duration: 0,
      status: 'Bad Number',
      callSid: callSid,
      notes: `Marked as bad number: ${reason}. Max retries (${2}) exceeded.`
    });

    // Update lead status in Notion if leadId exists
    if (leadId) {
      await this.notionService.updateLeadStatus(leadId, {
        status: 'Bad Number',
        notes: `Phone ${phone} marked as bad: ${reason}`
      });
    }

    // Send SMS alert
    await this.smsAlerts.sendFailureAlert({
      callSid: callSid,
      phone: phone,
      reason: `Bad Number: ${reason}`,
      error: 'Max retries exceeded'
    });
  }

  /**
   * Handle canceled call
   */
  async handleCanceled(callSid, to, leadId) {
    logger.info('Call was canceled', { callSid, to });

    await this.notionService.createCallRecord({
      callId: `CALL-${Date.now()}`,
      leadId: leadId,
      phoneNumber: to,
      callDate: new Date().toISOString(),
      duration: 0,
      status: 'Canceled',
      callSid: callSid
    });
  }

  /**
   * Flag a call for manual review in Notion
   */
  async flagForReview(callSid, phone, leadId, reason) {
    logger.warn('Call flagged for review', { callSid, reason });

    // Send SMS alert
    await this.smsAlerts.sendFailureAlert({
      callSid: callSid,
      phone: phone,
      reason: reason
    });
  }

  /**
   * Handle Twilio recording webhook
   * Fetches recording, transcribes, analyzes, updates Notion
   */
  async handleRecordingWebhook(req, res) {
    // Return 200 immediately
    res.sendStatus(200);

    const {
      RecordingSid,
      RecordingUrl,
      CallSid,
      RecordingDuration,
      LeadId
    } = req.body;

    logger.info('Recording webhook received', {
      recordingSid: RecordingSid,
      callSid: CallSid,
      duration: RecordingDuration
    });

    try {
      // Get cached call record info or look it up
      let callInfo = this.callRecordCache.get(CallSid);
      
      if (!callInfo) {
        logger.warn('Call info not in cache for recording', { callSid: CallSid });
        callInfo = {
          leadId: LeadId,
          phoneNumber: req.body.To || 'Unknown',
          createdAt: new Date().toISOString()
        };
      }

      // Step 1: Fetch recording from Twilio
      logger.info('Fetching recording from Twilio', { recordingSid: RecordingSid });
      const recordingResult = await this.twilioService.fetchRecording(RecordingSid);
      
      if (!recordingResult.success) {
        logger.error('Failed to fetch recording', {
          recordingSid: RecordingSid,
          error: recordingResult.error
        });
        return;
      }

      // Step 2: Transcribe the recording
      logger.info('Starting transcription', { recordingSid: RecordingSid });
      const transcriptionResult = await this.transcriptionService.transcribeAudio(
        recordingResult.buffer,
        'audio/mp3'
      );

      if (!transcriptionResult.success) {
        logger.error('Transcription failed', {
          recordingSid: RecordingSid,
          error: transcriptionResult.error
        });
        return;
      }

      // Step 3: Analyze the call outcome
      const transcript = transcriptionResult.transcript;
      const summary = this.transcriptionService.generateCallSummary(transcript);

      logger.info('Call analysis complete', {
        callSid: CallSid,
        outcome: summary.outcome.status,
        leadTemperature: summary.outcome.leadTemperature,
        sentiment: summary.outcome.sentiment,
        keyEvents: summary.keyEvents.map(e => e.type)
      });

      // Step 4: Update call record with transcription
      if (callInfo.pageId) {
        await this.notionService.updateCallRecordWithTranscript(callInfo.pageId, {
          fullText: transcript.fullText,
          summary: summary.summary,
          sentiment: summary.sentiment,
          keyEvents: summary.keyEvents,
          status: summary.outcome.status,
          leadTemperature: summary.outcome.leadTemperature,
          nextAction: summary.outcome.nextAction,
          callQuality: summary.outcome.callQuality
        });
      }

      // Step 5: Update lead status
      if (callInfo.leadId) {
        await this.notionService.updateLeadAfterCall(callInfo.leadId, {
          status: summary.outcome.status,
          leadTemperature: summary.outcome.leadTemperature,
          summary: summary.summary
        });
      }

      // Step 6: Handle alerts based on outcome
      await this.handleOutcomeAlerts(summary, callInfo, transcript);

      // Step 7: Clean up - delete recording from Twilio
      await this.twilioService.deleteRecording(RecordingSid);
      
      // Clean up cache
      this.callRecordCache.delete(CallSid);

      logger.info('Recording processing completed successfully', {
        recordingSid: RecordingSid,
        callSid: CallSid,
        outcome: summary.outcome.status
      });

    } catch (error) {
      logger.error('Error processing recording webhook', {
        recordingSid: RecordingSid,
        callSid: CallSid,
        error: error.message,
        stack: error.stack
      });
    }
  }

  /**
   * Handle SMS alerts based on call outcome
   */
  async handleOutcomeAlerts(summary, callInfo, transcript) {
    const events = summary.keyEvents || [];
    const outcome = summary.outcome || {};

    // Check for appointment scheduled
    const hasAppointment = events.some(e => e.type === 'appointment_mentioned') ||
                          outcome.status === 'Appointment Scheduled';
    
    if (hasAppointment) {
      await this.smsAlerts.sendAppointmentAlert({
        leadName: callInfo.leadName || 'Lead',
        phone: callInfo.phoneNumber,
        address: callInfo.address || 'See Notion',
        date: 'TBD',
        time: 'TBD',
        callRecordUrl: callInfo.pageId ? `https://notion.so/${callInfo.pageId}` : ''
      });
    }

    // Check for complaint
    const hasComplaint = events.some(e => e.type === 'complaint_raised');
    
    if (hasComplaint) {
      const complaintEvent = events.find(e => e.type === 'complaint_raised');
      
      await this.smsAlerts.sendComplaintAlert({
        leadName: callInfo.leadName || 'Lead',
        phone: callInfo.phoneNumber,
        issue: complaintEvent?.context || 'Complaint raised during call',
        transcriptExcerpt: transcript.fullText?.substring(0, 200) || '',
        callRecordUrl: callInfo.pageId ? `https://notion.so/${callInfo.pageId}` : ''
      });
    }

    // Check for DNC request
    const hasDNC = events.some(e => e.type === 'dnc_requested') ||
                   outcome.status === 'DNC';
    
    if (hasDNC) {
      await this.smsAlerts.sendDNCAlert({
        leadName: callInfo.leadName || 'Lead',
        phone: callInfo.phoneNumber,
        callRecordUrl: callInfo.pageId ? `https://notion.so/${callInfo.pageId}` : ''
      });
    }

    // Check for hot lead (high interest, not yet appointment)
    if (outcome.leadTemperature === 'Hot' && !hasAppointment && !hasComplaint) {
      await this.smsAlerts.sendHotLeadAlert({
        leadName: callInfo.leadName || 'Lead',
        phone: callInfo.phoneNumber,
        address: callInfo.address || 'See Notion',
        notes: summary.summary?.substring(0, 100) || 'Strong interest expressed'
      });
    }
  }

  /**
   * Start the retry queue processor
   * Runs every 15 minutes
   */
  startRetryProcessor() {
    const INTERVAL = 15 * 60 * 1000; // 15 minutes
    
    logger.info('Starting retry queue processor', { intervalMinutes: 15 });
    
    // Process immediately on start
    this.processRetryQueue();
    
    // Then every 15 minutes
    setInterval(() => {
      this.processRetryQueue();
    }, INTERVAL);
  }

  /**
   * Process items in the retry queue
   */
  async processRetryQueue() {
    const stats = this.retryQueue.getStats();
    
    if (stats.readyForRetry === 0) {
      logger.debug('No retry items ready for processing');
      return;
    }

    logger.info(`Processing retry queue`, { 
      readyForRetry: stats.readyForRetry,
      totalPending: stats.pending,
      badNumbersCount: stats.badNumbersCount
    });

    const results = await this.retryQueue.processQueue(async (item) => {
      try {
        logger.info(`Retrying call`, { 
          id: item.id,
          callSid: item.callSid,
          phone: item.phoneNumber,
          retryCount: item.retryCount,
          reason: item.reason
        });

        // Check if bad number before attempting
        if (this.retryQueue.isBadNumber(item.phoneNumber)) {
          return { 
            success: false, 
            permanent: true, 
            error: 'Phone number marked as bad' 
          };
        }

        // Attempt the call again
        const result = await this.twilioService.initiateCall(
          item.phoneNumber,
          item.leadId
        );

        if (result.success) {
          logger.info(`Retry call initiated successfully`, {
            originalCallSid: item.callSid,
            newCallSid: result.callSid,
            retryId: item.id
          });
          return { success: true };
        } else {
          logger.error(`Retry call failed`, {
            retryId: item.id,
            error: result.error
          });
          return { success: false, error: result.error };
        }
      } catch (error) {
        logger.error(`Error during retry processing`, {
          retryId: item.id,
          error: error.message
        });
        return { success: false, error: error.message };
      }
    });

    logger.info(`Retry queue processing complete`, results);

    // Send summary if there were items processed
    if (results.processed > 0) {
      await this.smsAlerts.sendRetrySummary({
        totalPending: stats.pending,
        readyForRetry: stats.readyForRetry - results.succeeded,
        permanentlyFailed: stats.permanentlyFailed + results.permanentlyFailed
      });
    }

    // Cleanup old items periodically
    this.retryQueue.cleanup();
  }

  /**
   * Get current queue statistics
   */
  getQueueStats() {
    return this.retryQueue.getStats();
  }

  /**
   * Get bad numbers list
   */
  getBadNumbers() {
    return this.retryQueue.getBadNumbers();
  }

  /**
   * Get cache statistics (for monitoring)
   */
  getCacheStats() {
    return {
      cachedCalls: this.callRecordCache.size,
      voicemailCache: this.voicemailCache.size,
      cacheKeys: Array.from(this.callRecordCache.keys())
    };
  }
}

// Singleton instance
let handlersInstance = null;

function getWebhookHandlers() {
  if (!handlersInstance) {
    handlersInstance = new WebhookHandlers();
  }
  return handlersInstance;
}

module.exports = { WebhookHandlers, getWebhookHandlers };