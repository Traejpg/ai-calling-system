require('dotenv').config();
const express = require('express');
const twilio = require('twilio');
const notionLogger = require('./lib/notionLogger');
const transcription = require('./lib/transcription');
const { getWebhookHandlers } = require('./lib/webhookHandlers');
const { getRetryQueue } = require('./lib/retryQueue');

const app = express();
const PORT = process.env.PORT || 3000;

// Twilio credentials for signature validation
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER;

// ElevenLabs configuration
const ELEVENLABS_AGENT_ID = process.env.ELEVENLABS_AGENT_ID;
const WEBHOOK_BASE_URL = process.env.WEBHOOK_BASE_URL;

// Initialize webhook handlers
const webhookHandlers = getWebhookHandlers();

// Middleware to parse URL-encoded bodies (Twilio sends form data)
// Increased limits for ElevenLabs webhooks (can include large transcripts)
app.use(express.urlencoded({ extended: false, limit: '10mb' }));
app.use(express.json({ limit: '10mb' }));

/**
 * Middleware to validate webhook signatures
 * Supports both Twilio and ElevenLabs webhooks
 */
function validateTwilioWebhook(req, res, next) {
  // Log incoming webhook immediately
  console.log(`\n[${new Date().toISOString()}] Incoming ${req.method} request to ${req.path}`);

  // Detect webhook source by headers
  const isTwilio = req.headers['x-twilio-signature'];
  const isElevenLabs = req.headers['x-elevenlabs-signature'];

  console.log(`   Source: ${isTwilio ? 'Twilio' : isElevenLabs ? 'ElevenLabs' : 'Unknown'}`);

  // Skip validation for ElevenLabs (we handle that separately if needed)
  if (isElevenLabs) {
    console.log('✅ ElevenLabs webhook - skipping Twilio validation');
    return next();
  }

  // Skip validation if no Twilio auth token (development mode)
  if (!TWILIO_AUTH_TOKEN) {
    console.warn('⚠️  TWILIO_AUTH_TOKEN not set - skipping signature validation');
    return next();
  }

  // Skip if no Twilio signature present
  if (!isTwilio) {
    console.warn('⚠️  No Twilio signature - skipping validation');
    return next();
  }

  // Validate Twilio signature
  const twilioSignature = req.headers['x-twilio-signature'];
  const url = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
  
  const isValid = twilio.validateRequest(
    TWILIO_AUTH_TOKEN,
    twilioSignature,
    url,
    req.body
  );

  if (!isValid) {
    console.error('❌ Invalid Twilio signature - rejecting webhook');
    return res.status(403).send('Forbidden: Invalid signature');
  }

  console.log('✅ Twilio signature validated');
  next();
}

/**
 * POST /webhooks/twilio/status
 * Receives call status events from Twilio
 * Handles AMD results, voicemail detection, and bad number tracking
 */
app.post('/webhooks/twilio/status', validateTwilioWebhook, async (req, res) => {
  // Pass to webhook handlers
  await webhookHandlers.handleStatusWebhook(req, res);
});

/**
 * POST /webhooks/twilio/recording
 * Receives recording available events from Twilio
 * Updates Call Record with RecordingUrl and triggers transcription
 */
app.post('/webhooks/twilio/recording', validateTwilioWebhook, async (req, res) => {
  // Pass to webhook handlers
  await webhookHandlers.handleRecordingWebhook(req, res);
});

/**
 * POST /webhooks/elevenlabs/post-call
 * Receives post-call webhooks from ElevenLabs
 * Handles call completion, voicemail detection, and status updates
 */
app.post('/webhooks/elevenlabs/post-call', express.json(), async (req, res) => {
  console.log('\n📞 ElevenLabs Post-Call Webhook');
  console.log('Body:', JSON.stringify(req.body, null, 2));

  // Return 200 immediately
  res.status(200).send('OK');

  const body = req.body;
  
  // Map ElevenLabs format to Twilio-style for consistency
  const mappedBody = {
    conversation_id: body.conversation_id,
    status: body.status,
    call_duration_secs: body.call_duration_secs,
    from_number: body.from_number,
    to_number: body.to_number,
    recording_url: body.recording_url,
    // Map ElevenLabs-specific fields
    is_voicemail: body.is_voicemail || body.voicemail_detected,
    voicemail_detected: body.voicemail_detected,
    lead_id: body.lead_id
  };

  // Process through main webhook handler
  const mockReq = { body: mappedBody, headers: req.headers };
  const mockRes = {
    sendStatus: () => {},
    status: () => ({ send: () => {} })
  };

  await webhookHandlers.handleStatusWebhook(mockReq, mockRes);
});

/**
 * GET /twiml/voice
 * TwiML for inbound calls or AMD callback
 * Connects to ElevenLabs AI agent
 */
app.get('/twiml/voice', (req, res) => {
  const elevenlabsSipDomain = 'agent.elevenlabs.io';
  
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="wss://${elevenlabsSipDomain}/twilio">
      <Parameter name="agent_id" value="${ELEVENLABS_AGENT_ID}" />
    </Stream>
  </Connect>
</Response>`;

  res.type('text/xml');
  res.send(twiml);
});

/**
 * GET /twiml/voicemail
 * TwiML for voicemail drops
 * Leaves the pre-recorded voicemail message
 */
app.get('/twiml/voicemail', (req, res) => {
  const { lead_name, property_address, callback_number } = req.query;
  
  const name = lead_name || 'there';
  const address = property_address || 'your property';
  const phone = callback_number || TWILIO_PHONE_NUMBER || '773-985-2082';
  
  // Format phone number for speaking
  const formattedPhone = phone.replace(/(\d{3})(\d{3})(\d{4})/, '$1-$2-$3');
  
  // 30-second voicemail message
  const message = `Hi ${name}, this is Alexis with Trae Castile. I'm calling about your property at ${address}. Please call me back at ${formattedPhone} to discuss a potential offer. Thanks!`;

  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Pause length="2"/>
  <Say voice="Polly.Joanna">${message}</Say>
  <Hangup/>
</Response>`;

  res.type('text/xml');
  res.send(twiml);
});

/**
 * POST /twiml/amd-callback
 * Answering Machine Detection callback
 * Called when Twilio AMD detects a machine
 */
app.post('/twiml/amd-callback', express.urlencoded({ extended: false }), async (req, res) => {
  const {
    CallSid,
    AnsweredBy,
    To,
    From,
    lead_id
  } = req.body;

  console.log('\n🤖 AMD Callback:', { CallSid, AnsweredBy, To });

  // Handle machine detection
  if (AnsweredBy === 'machine_start' || 
      AnsweredBy === 'machine_end_beep' || 
      AnsweredBy === 'machine_end_silence' ||
      AnsweredBy === 'machine_end_other') {
    
    console.log('📞 Machine detected - leaving voicemail');
    
    // Redirect to voicemail TwiML
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Redirect>/twiml/voicemail?${new URLSearchParams({
    lead_id: lead_id || '',
    callback_number: TWILIO_PHONE_NUMBER || ''
  }).toString()}</Redirect>
</Response>`;

    res.type('text/xml');
    res.send(twiml);
    
    // Log the voicemail drop
    await notionLogger.createCallRecord({
      CallSid,
      To,
      From,
      Status: 'Voicemail Left',
      Duration: 0,
      Notes: `AMD detected: ${AnsweredBy}`
    });
    
  } else {
    // Human answered - connect to ElevenLabs agent
    const elevenlabsSipDomain = 'agent.elevenlabs.io';
    
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="wss://${elevenlabsSipDomain}/twilio">
      <Parameter name="agent_id" value="${ELEVENLABS_AGENT_ID}" />
      <Parameter name="lead_id" value="${lead_id || ''}" />
    </Stream>
  </Connect>
</Response>`;

    res.type('text/xml');
    res.send(twiml);
  }
});

/**
 * POST /tools/transfer-call
 * ElevenLabs Custom Tool: Transfer hot lead to human agent
 * Creates conference call with lead and agent
 */
app.post('/tools/transfer-call', express.json(), async (req, res) => {
  console.log('\n🔥 Transfer Tool Triggered');
  console.log('Body:', JSON.stringify(req.body, null, 2));

  const { 
    call_sid,
    lead_name, 
    property_address, 
    lead_phone,
    transfer_reason 
  } = req.body;

  if (!call_sid) {
    return res.status(400).json({
      success: false,
      error: 'Missing call_sid'
    });
  }

  try {
    const { transferToAgent } = require('./lib/transferTool');
    
    const result = await transferToAgent({
      call_sid,
      lead_name: lead_name || 'Unknown',
      property_address: property_address || 'Unknown',
      lead_phone: lead_phone || 'Unknown',
      transfer_reason: transfer_reason || 'Hot lead'
    });

    res.json(result);

  } catch (error) {
    console.error('Transfer tool error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Transfer failed - agent will call back manually'
    });
  }
});

/**
 * POST /api/calls/initiate-with-amd
 * Initiate a call with Answering Machine Detection enabled
 */
app.post('/api/calls/initiate-with-amd', express.json(), async (req, res) => {
  const { phone_number, lead_id, lead_name, property_address } = req.body;

  if (!phone_number) {
    return res.status(400).json({ error: 'phone_number is required' });
  }

  try {
    const client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
    
    // Format phone number
    let formattedNumber = phone_number.replace(/\D/g, '');
    if (formattedNumber.length === 10) {
      formattedNumber = '+1' + formattedNumber;
    } else if (!formattedNumber.startsWith('+')) {
      formattedNumber = '+' + formattedNumber;
    }

    console.log('\n📞 Initiating call with AMD:', {
      to: formattedNumber,
      lead_id,
      lead_name
    });

    // Create call with AMD enabled
    const call = await client.calls.create({
      to: formattedNumber,
      from: TWILIO_PHONE_NUMBER,
      url: `${WEBHOOK_BASE_URL}/twiml/voice`,
      statusCallback: `${WEBHOOK_BASE_URL}/webhooks/twilio/status`,
      statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed', 'busy', 'no-answer', 'failed'],
      statusCallbackMethod: 'POST',
      
      // AMD Configuration
      machineDetection: 'DetectMessageEnd',
      asyncAmd: true,
      amdStatusCallback: `${WEBHOOK_BASE_URL}/twiml/amd-callback`,
      amdStatusCallbackMethod: 'POST',
      
      // Recording
      record: true,
      recordingStatusCallback: `${WEBHOOK_BASE_URL}/webhooks/twilio/recording`,
      recordingStatusCallbackMethod: 'POST',
      
      // Custom parameters
      customParameters: {
        lead_id: lead_id || '',
        lead_name: lead_name || '',
        property_address: property_address || ''
      }
    });

    console.log('✅ Call initiated:', {
      callSid: call.sid,
      status: call.status
    });

    res.json({
      success: true,
      callSid: call.sid,
      status: call.status,
      to: formattedNumber,
      amdEnabled: true
    });

  } catch (error) {
    console.error('❌ Failed to initiate call:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/retry-queue/stats
 * Get retry queue statistics
 */
app.get('/api/retry-queue/stats', (req, res) => {
  const stats = webhookHandlers.getQueueStats();
  const badNumbers = webhookHandlers.getBadNumbers();
  
  res.json({
    ...stats,
    badNumbers: badNumbers.slice(0, 100), // Limit response size
    badNumbersTotal: badNumbers.length
  });
});

/**
 * GET /api/bad-numbers
 * Get list of bad numbers
 */
app.get('/api/bad-numbers', (req, res) => {
  const badNumbers = webhookHandlers.getBadNumbers();
  const retryQueue = getRetryQueue();
  
  res.json({
    count: badNumbers.length,
    badNumbers: badNumbers,
    stats: retryQueue.getStats()
  });
});

/**
 * POST /api/bad-numbers/clear
 * Clear a number from the bad numbers list (admin only)
 */
app.post('/api/bad-numbers/clear', express.json(), async (req, res) => {
  const { phone_number, admin_key } = req.body;
  
  // Simple admin authentication
  if (admin_key !== process.env.ADMIN_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  if (!phone_number) {
    return res.status(400).json({ error: 'phone_number is required' });
  }
  
  const retryQueue = getRetryQueue();
  const normalized = retryQueue.normalizePhone(phone_number);
  
  // Remove from bad numbers set
  retryQueue.badNumbers.delete(normalized);
  retryQueue.saveBadNumbers();
  
  res.json({
    success: true,
    message: `Cleared ${phone_number} from bad numbers list`,
    normalized: normalized
  });
});

/**
 * GET /twiml/hold-music
 * Hold music and messaging for conference transfers
 * Plays for up to 60 seconds while waiting for agent
 */
app.get('/twiml/hold-music', (req, res) => {
  res.type('text/xml');
  res.send(`
    <Response>
      <Say voice="Polly.Joanna">Please continue to hold. Your call is being connected.</Say>
      <Play>https://assets.twilio.com/cowbell.mp3</Play>
      <Pause length="5"/>
      <Say voice="Polly.Joanna">Still connecting. Please hold just a moment longer.</Say>
      <Play>https://assets.twilio.com/cowbell.mp3</Play>
      <Pause length="5"/>
      <Say voice="Polly.Joanna">Thank you for your patience. Connecting now.</Say>
      <Play>https://assets.twilio.com/cowbell.mp3</Play>
    </Response>
  `);
});

/**
 * Health check endpoint
 */
app.get('/health', (req, res) => {
  const stats = webhookHandlers.getQueueStats();
  const cacheStats = webhookHandlers.getCacheStats();
  
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    services: {
      notion: !!process.env.NOTION_TOKEN,
      callsDb: !!process.env.NOTION_CALLS_DB_ID,
      deepgram: transcription.isConfigured(),
      twilio: !!TWILIO_AUTH_TOKEN,
      elevenlabs: !!process.env.ELEVENLABS_API_KEY
    },
    queue: stats,
    cache: cacheStats
  });
});

/**
 * Root endpoint
 */
app.get('/', (req, res) => {
  res.status(200).json({
    name: 'AI Calling System Webhook Server',
    version: '1.1.0',
    features: [
      'Voicemail Detection (AMD)',
      'Voicemail Drops',
      'Bad Number Retry Logic',
      'Post-Call Analysis'
    ],
    endpoints: [
      // Webhooks
      'POST /webhooks/twilio/status',
      'POST /webhooks/twilio/recording',
      'POST /webhooks/elevenlabs/post-call',
      
      // TwiML
      'GET /twiml/voice',
      'GET /twiml/voicemail',
      'POST /twiml/amd-callback',
      
      // API
      'POST /api/calls/initiate-with-amd',
      'GET /api/retry-queue/stats',
      'GET /api/bad-numbers',
      
      // Tools
      'POST /tools/transfer-call',
      
      // Health
      'GET /health'
    ]
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).send('Internal Server Error');
});

// Start the server
app.listen(PORT, () => {
  console.log(`\n🚀 AI Calling System Webhook Server v1.1.0`);
  console.log(`   Running on port ${PORT}`);
  console.log(`   Health check: http://localhost:${PORT}/health`);
  console.log(`   Webhook endpoints:`);
  console.log(`     - POST /webhooks/twilio/status`);
  console.log(`     - POST /webhooks/twilio/recording`);
  console.log(`     - POST /webhooks/elevenlabs/post-call`);
  console.log(`   AMD/TwiML endpoints:`);
  console.log(`     - GET /twiml/voice`);
  console.log(`     - GET /twiml/voicemail`);
  console.log(`     - POST /twiml/amd-callback`);
  console.log(`   API endpoints:`);
  console.log(`     - POST /api/calls/initiate-with-amd`);
  console.log(`     - GET /api/retry-queue/stats`);
  console.log(`     - GET /api/bad-numbers`);
  
  if (!TWILIO_AUTH_TOKEN) {
    console.log(`\n⚠️  Warning: TWILIO_AUTH_TOKEN not set`);
    console.log(`   Set it in .env file for production signature validation`);
  }
  
  if (!process.env.NOTION_CALLS_DB_ID) {
    console.log(`\n⚠️  Warning: NOTION_CALLS_DB_ID not set`);
    console.log(`   Call records will not be logged to Notion`);
  }
  
  if (!transcription.isConfigured()) {
    console.log(`\n⚠️  Warning: DEEPGRAM_API_KEY not set`);
    console.log(`   Transcription will be skipped`);
  }
  
  console.log('\n✅ Features enabled:');
  console.log('   - Voicemail Detection (AMD)');
  console.log('   - Voicemail Drops');
  console.log('   - Bad Number Retry Logic (15min delay, 2 retries)');
  console.log('   - Post-Call Analysis');
  console.log('');
});

module.exports = app;