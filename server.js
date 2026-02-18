require('dotenv').config();
const express = require('express');
const twilio = require('twilio');
const notionLogger = require('./lib/notionLogger');
const transcription = require('./lib/transcription');

const app = express();
const PORT = process.env.PORT || 3000;

// Twilio credentials for signature validation
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;

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
 * Creates Call Record in Notion when call is completed
 */
app.post('/webhooks/twilio/status', validateTwilioWebhook, async (req, res) => {
  // Return 200 OK immediately to prevent retries
  res.status(200).send('OK');

  // Support both Twilio and ElevenLabs webhook formats
  const body = req.body;
  
  // ElevenLabs format
  const CallSid = body.CallSid || body.conversation_id || body.call_sid;
  const CallStatus = body.CallStatus || body.status;
  const CallDuration = body.CallDuration || body.call_duration_secs || body.duration;
  const RecordingSid = body.RecordingSid || body.recording_sid;
  const RecordingUrl = body.RecordingUrl || body.recording_url;
  const From = body.From || body.from_number || body.caller_id;
  const To = body.To || body.to_number || body.called_number;
  const Direction = body.Direction || body.direction;

  console.log(`\n📞 Call Status Event:`);
  console.log(`   Source: ${body.conversation_id ? 'ElevenLabs' : 'Twilio'}`);
  console.log(`   Call SID: ${CallSid}`);
  console.log(`   Status: ${CallStatus}`);
  console.log(`   Duration: ${CallDuration || 'N/A'} seconds`);
  console.log(`   From: ${From}`);
  console.log(`   To: ${To}`);
  console.log(`   Direction: ${Direction}`);
  
  if (RecordingSid) {
    console.log(`   Recording SID: ${RecordingSid}`);
    console.log(`   Recording URL: ${RecordingUrl}`);
  }

  // Create Call Record in Notion when call is completed
  if (CallStatus === 'completed') {
    try {
      console.log(`\n📝 Creating Notion call record for completed call...`);
      
      const result = await notionLogger.createCallRecord({
        CallSid,
        From,
        To,
        Duration: CallDuration,
        Status: CallStatus,
        Direction
      });

      if (result.success) {
        console.log(`   ✅ Call record created: ${result.url}`);
        if (result.leadId) {
          console.log(`   🔗 Linked to Lead: ${result.leadId}`);
        }
      } else {
        console.error(`   ❌ Failed to create call record: ${result.error}`);
      }
    } catch (error) {
      console.error(`   ❌ Error creating call record: ${error.message}`);
    }
  }
});

/**
 * POST /webhooks/twilio/recording
 * Receives recording available events from Twilio
 * Updates Call Record with RecordingUrl and triggers transcription
 */
app.post('/webhooks/twilio/recording', validateTwilioWebhook, async (req, res) => {
  // Return 200 OK immediately to prevent Twilio retries
  res.status(200).send('OK');

  // Process the recording event asynchronously
  const {
    RecordingSid,
    RecordingUrl,
    RecordingDuration,
    RecordingChannels,
    RecordingStartTime,
    RecordingStatus,
    CallSid,
    From,
    To
  } = req.body;

  console.log(`\n🎙️  Recording Available Event:`);
  console.log(`   Recording SID: ${RecordingSid}`);
  console.log(`   Recording URL: ${RecordingUrl}`);
  console.log(`   Duration: ${RecordingDuration} seconds`);
  console.log(`   Channels: ${RecordingChannels}`);
  console.log(`   Start Time: ${RecordingStartTime}`);
  console.log(`   Status: ${RecordingStatus}`);
  console.log(`   Call SID: ${CallSid}`);
  console.log(`   From: ${From}`);
  console.log(`   To: ${To}`);

  // Update Call Record with RecordingUrl and trigger transcription
  if (RecordingUrl && CallSid) {
    try {
      console.log(`\n📝 Updating Notion call record with recording...`);

      // First update with RecordingUrl
      const updateResult = await notionLogger.updateCallRecord(CallSid, {
        recordingUrl: RecordingUrl,
        recordingStatus: 'Processing'
      });

      if (updateResult.success) {
        console.log(`   ✅ Recording URL saved to Notion`);
      } else {
        console.warn(`   ⚠️  Could not update call record: ${updateResult.error}`);
      }

      // Trigger Deepgram transcription
      if (transcription.isConfigured()) {
        console.log(`\n🎯 Triggering Deepgram transcription...`);
        
        try {
          const transcriptResult = await transcription.transcribeRecording(RecordingUrl);
          
          console.log(`   ✅ Transcription complete (${transcriptResult.confidence}% confidence)`);
          console.log(`   📝 Transcript preview: ${transcriptResult.transcript.substring(0, 100)}...`);

          // Update call record with transcript
          const transcriptUpdate = await notionLogger.updateCallRecord(CallSid, {
            transcript: transcriptResult.transcript,
            recordingStatus: 'Transcribed',
            notes: `Transcription confidence: ${(transcriptResult.confidence * 100).toFixed(1)}%`
          });

          if (transcriptUpdate.success) {
            console.log(`   ✅ Transcript saved to Notion`);
          } else {
            console.warn(`   ⚠️  Could not save transcript: ${transcriptUpdate.error}`);
          }
        } catch (transcriptError) {
          console.error(`   ❌ Transcription failed: ${transcriptError.message}`);
          
          // Update call record with error status
          await notionLogger.updateCallRecord(CallSid, {
            recordingStatus: 'Transcription Failed',
            notes: `Transcription error: ${transcriptError.message}`
          });
        }
      } else {
        console.warn(`   ⚠️  Deepgram not configured - skipping transcription`);
        
        // Update to indicate no transcription
        await notionLogger.updateCallRecord(CallSid, {
          recordingStatus: 'Recording Available',
          notes: 'Transcription not configured'
        });
      }
    } catch (error) {
      console.error(`   ❌ Error processing recording: ${error.message}`);
    }
  } else {
    console.warn(`   ⚠️  Missing RecordingUrl or CallSid - skipping Notion update`);
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
 * GET /twiml/hold-music
 * Hold music for conference transfers
 */
app.get('/twiml/hold-music', (req, res) => {
  res.type('text/xml');
  res.send(`
    <Response>
      <Play>https://assets.twilio.com/cowbell.mp3</Play>
    </Response>
  `);
});

/**
 * Health check endpoint
 */
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    services: {
      notion: !!process.env.NOTION_TOKEN,
      callsDb: !!process.env.NOTION_CALLS_DB_ID,
      deepgram: transcription.isConfigured()
    }
  });
});

/**
 * Root endpoint
 */
app.get('/', (req, res) => {
  res.status(200).json({
    name: 'AI Calling System Webhook Server',
    version: '1.0.0',
    endpoints: [
      'POST /webhooks/twilio/status',
      'POST /webhooks/twilio/recording',
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
  console.log(`\n🚀 AI Calling System Webhook Server`);
  console.log(`   Running on port ${PORT}`);
  console.log(`   Health check: http://localhost:${PORT}/health`);
  console.log(`   Webhook endpoints:`);
  console.log(`     - POST /webhooks/twilio/status`);
  console.log(`     - POST /webhooks/twilio/recording`);
  
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
  console.log('');
});

module.exports = app;
