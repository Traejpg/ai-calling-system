/**
 * Main Express Server
 * 
 * Handles webhooks from Twilio and serves as the central orchestrator
 * Uses modular webhook handlers for processing logic
 */

require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const logger = require('./utils/logger');
const TwilioService = require('./services/twilio');
const NotionService = require('./services/notion');
const AlertService = require('./services/alerts');
const { getWebhookHandlers } = require('../lib/webhookHandlers');
const { getSMSAlerts } = require('../lib/smsAlerts');
const { getRetryQueue } = require('../lib/retryQueue');

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize services
const twilioService = new TwilioService();
const notionService = new NotionService();
const alertService = new AlertService();
const webhookHandlers = getWebhookHandlers();
const smsAlerts = getSMSAlerts();
const retryQueue = getRetryQueue();

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Request logging
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`, {
    ip: req.ip,
    userAgent: req.get('user-agent')
  });
  next();
});

/**
 * Health check endpoint
 */
app.get('/health', (req, res) => {
  const queueStats = retryQueue.getStats();
  const cacheStats = webhookHandlers.getCacheStats();
  
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    services: {
      twilio: !!process.env.TWILIO_ACCOUNT_SID,
      notion: !!process.env.NOTION_API_KEY,
      deepgram: !!process.env.DEEPGRAM_API_KEY,
      smsAlerts: smsAlerts.isConfigured()
    },
    queue: queueStats,
    cache: {
      size: cacheStats.cachedCalls
    }
  });
});

/**
 * Twilio voice webhook - Initial call handling
 * Returns TwiML to connect to ElevenLabs AI agent
 */
app.post('/webhooks/twilio/voice', (req, res) => {
  logger.info('Twilio voice webhook received', {
    callSid: req.body.CallSid,
    from: req.body.From,
    to: req.body.To
  });

  const twiml = twilioService.generateVoiceResponse();
  
  res.type('text/xml');
  res.send(twiml);
});

/**
 * Twilio status callback webhook
 * Handles call status changes: completed, no-answer, busy, failed
 * Delegates to webhook handlers
 */
app.post('/webhooks/twilio/status', (req, res) => {
  // Delegate to webhook handlers (returns 200 immediately)
  webhookHandlers.handleStatusWebhook(req, res);
});

/**
 * Twilio recording webhook
 * Triggered when recording is available
 * Delegates to webhook handlers for transcription and analysis
 */
app.post('/webhooks/twilio/recording', (req, res) => {
  // Delegate to webhook handlers (returns 200 immediately)
  webhookHandlers.handleRecordingWebhook(req, res);
});

/**
 * Manual call trigger endpoint (for testing or manual calls)
 */
app.post('/api/calls/trigger', async (req, res) => {
  try {
    const { phone, leadId } = req.body;

    if (!phone) {
      return res.status(400).json({ error: 'Phone number required' });
    }

    const result = await twilioService.initiateCall(phone, leadId);
    
    res.json(result);

  } catch (error) {
    logger.error('Manual call trigger failed', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get leads ready for calling
 */
app.get('/api/leads/ready', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const leads = await notionService.getLeadsForCalling(limit);
    
    res.json({
      count: leads.length,
      leads: leads
    });

  } catch (error) {
    logger.error('Failed to get leads', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

/**
 * Send test alert
 */
app.post('/api/alerts/test', async (req, res) => {
  try {
    const result = await smsAlerts.sendTestAlert();
    res.json(result);
  } catch (error) {
    logger.error('Test alert failed', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

/**
 * Send test appointment alert
 */
app.post('/api/alerts/test/appointment', async (req, res) => {
  try {
    const result = await smsAlerts.sendAppointmentAlert({
      leadName: req.body.leadName || 'Test Lead',
      phone: req.body.phone || '+15551234567',
      address: req.body.address || '123 Test St, Chicago',
      date: req.body.date || 'Tomorrow',
      time: req.body.time || '2:00 PM'
    });
    res.json(result);
  } catch (error) {
    logger.error('Test appointment alert failed', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

/**
 * Send test complaint alert
 */
app.post('/api/alerts/test/complaint', async (req, res) => {
  try {
    const result = await smsAlerts.sendComplaintAlert({
      leadName: req.body.leadName || 'Test Lead',
      phone: req.body.phone || '+15551234567',
      issue: req.body.issue || 'Test complaint alert',
      transcriptExcerpt: req.body.excerpt || 'This is a test of the complaint alert system...'
    });
    res.json(result);
  } catch (error) {
    logger.error('Test complaint alert failed', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get retry queue statistics
 */
app.get('/api/queue/stats', (req, res) => {
  const stats = retryQueue.getStats();
  res.json(stats);
});

/**
 * Manually trigger retry queue processing
 */
app.post('/api/queue/process', async (req, res) => {
  try {
    // Note: This runs asynchronously, returns immediately
    webhookHandlers.processRetryQueue();
    res.json({ 
      message: 'Retry queue processing triggered',
      currentStats: retryQueue.getStats()
    });
  } catch (error) {
    logger.error('Failed to trigger queue processing', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get cache statistics (for monitoring)
 */
app.get('/api/cache/stats', (req, res) => {
  const stats = webhookHandlers.getCacheStats();
  res.json(stats);
});

/**
 * Clear the call record cache
 */
app.post('/api/cache/clear', (req, res) => {
  const stats = webhookHandlers.getCacheStats();
  // The cache is internal to webhookHandlers, so we just report current state
  res.json({ 
    message: 'Cache stats (cache auto-clears after processing)',
    currentStats: stats
  });
});

// Error handling
app.use((err, req, res, next) => {
  logger.error('Unhandled error', {
    error: err.message,
    stack: err.stack,
    path: req.path
  });
  
  res.status(500).json({ 
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// Start server
app.listen(PORT, () => {
  logger.info(`AI Calling System server started on port ${PORT}`);
  logger.info(`Webhook base URL: ${process.env.WEBHOOK_BASE_URL}`);
  logger.info(`Retry queue processor running (15 min interval)`);
  
  // Log configuration status
  const configStatus = {
    twilio: !!process.env.TWILIO_ACCOUNT_SID,
    notion: !!process.env.NOTION_API_KEY,
    deepgram: !!process.env.DEEPGRAM_API_KEY,
    elevenlabs: !!process.env.ELEVENLABS_AGENT_ID,
    smsAlerts: smsAlerts.isConfigured()
  };
  
  logger.info('Service configuration', configStatus);
  
  if (!smsAlerts.isConfigured()) {
    logger.warn('SMS alerts not configured - set ALERT_PHONE_NUMBER to enable');
  }
});

module.exports = app;