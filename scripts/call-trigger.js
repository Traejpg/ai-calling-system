#!/usr/bin/env node
/**
 * Call Trigger Script
 * 
 * Queries Notion for hot leads and initiates calls
 * Rate limited to 4 calls per hour
 * Runs during business hours only
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const logger = require('./src/utils/logger');
const NotionService = require('./src/services/notion');
const TwilioService = require('./src/services/twilio');

const STATE_FILE = path.join(process.cwd(), 'data', 'call-state.json');
const MAX_CALLS_PER_HOUR = parseInt(process.env.MAX_CALLS_PER_HOUR) || 4;
const BUSINESS_HOURS_START = parseInt(process.env.BUSINESS_HOURS_START) || 9;
const BUSINESS_HOURS_END = parseInt(process.env.BUSINESS_HOURS_END) || 18;

// Ensure data directory exists
if (!fs.existsSync(path.dirname(STATE_FILE))) {
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
}

/**
 * Load call state
 */
function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    }
  } catch (error) {
    logger.error('Failed to load state', { error: error.message });
  }
  return { callsThisHour: 0, hourStarted: Date.now(), callsToday: [] };
}

/**
 * Save call state
 */
function saveState(state) {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  } catch (error) {
    logger.error('Failed to save state', { error: error.message });
  }
}

/**
 * Check if we're within business hours
 */
function isBusinessHours() {
  const timezone = process.env.TIMEZONE || 'America/Chicago';
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
  
  return hour >= BUSINESS_HOURS_START && hour < BUSINESS_HOURS_END;
}

/**
 * Reset hourly counter if needed
 */
function resetHourlyCounter(state) {
  const hourAgo = Date.now() - (60 * 60 * 1000);
  if (state.hourStarted < hourAgo) {
    return { ...state, callsThisHour: 0, hourStarted: Date.now() };
  }
  return state;
}

/**
 * Main execution
 */
async function main() {
  logger.info('Call trigger script started');

  // Check business hours
  if (!isBusinessHours()) {
    logger.info('Outside business hours, skipping');
    process.exit(0);
  }

  // Load and reset state
  let state = loadState();
  state = resetHourlyCounter(state);

  // Check rate limit
  if (state.callsThisHour >= MAX_CALLS_PER_HOUR) {
    logger.info(`Rate limit reached (${MAX_CALLS_PER_HOUR}/hour), skipping`);
    process.exit(0);
  }

  const notion = new NotionService();
  const twilio = new TwilioService();

  // Get leads ready for calling
  const remainingSlots = MAX_CALLS_PER_HOUR - state.callsThisHour;
  const leads = await notion.getLeadsForCalling(remainingSlots);

  if (leads.length === 0) {
    logger.info('No leads ready for calling');
    process.exit(0);
  }

  logger.info(`Found ${leads.length} leads to call (max ${remainingSlots})`);

  // Initiate calls
  for (const lead of leads) {
    if (!lead.phone) {
      logger.warn(`Lead ${lead.id} has no phone number, skipping`);
      continue;
    }

    logger.info(`Initiating call to ${lead.name} at ${lead.phone}`);

    const result = await twilio.initiateCall(lead.phone, lead.id);

    if (result.success) {
      state.callsThisHour++;
      state.callsToday.push({
        leadId: lead.id,
        callSid: result.callSid,
        timestamp: Date.now(),
        phone: lead.phone
      });

      logger.info(`Call initiated successfully`, {
        callSid: result.callSid,
        leadId: lead.id
      });

      // Wait 5 seconds between calls to avoid overwhelming Twilio
      await new Promise(resolve => setTimeout(resolve, 5000));
    } else {
      logger.error(`Failed to initiate call`, {
        leadId: lead.id,
        error: result.error
      });
    }
  }

  // Save state
  saveState(state);

  logger.info(`Call trigger completed. Calls this hour: ${state.callsThisHour}`);
  process.exit(0);
}

// Run main
main().catch(error => {
  logger.error('Call trigger script failed', { error: error.message, stack: error.stack });
  process.exit(1);
});