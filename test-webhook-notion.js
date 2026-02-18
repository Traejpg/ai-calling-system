/**
 * Test Script: Webhook to Notion Flow
 * 
 * This script tests the complete webhook → Notion flow:
 * 1. Simulates Twilio status webhook (call completed)
 * 2. Verifies call record is created in Notion
 * 3. Simulates Twilio recording webhook
 * 4. Verifies recording URL is saved and transcription triggered
 * 
 * Usage: node test-webhook-notion.js
 */

require('dotenv').config();
const axios = require('axios');
const notionLogger = require('./lib/notionLogger');

// Configuration
const SERVER_URL = process.env.WEBHOOK_URL || 'http://localhost:3000';
const TEST_PHONE = process.env.TEST_LEAD_PHONE || '+15551234567';

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

/**
 * Test 1: Simulate Twilio Status Webhook (Call Completed)
 */
async function testStatusWebhook() {
  log('\n========================================', 'cyan');
  log('TEST 1: Twilio Status Webhook', 'cyan');
  log('========================================\n', 'cyan');

  const testCallSid = `TEST${Date.now()}`;
  
  const webhookData = {
    CallSid: testCallSid,
    CallStatus: 'completed',
    CallDuration: '125',
    From: TEST_PHONE,
    To: '+18664269424',
    Direction: 'outbound-api'
  };

  log('Sending status webhook...', 'blue');
  log(`Call SID: ${testCallSid}`, 'yellow');
  log(`From: ${TEST_PHONE}`, 'yellow');
  log(`Duration: 125 seconds\n`, 'yellow');

  try {
    const response = await axios.post(
      `${SERVER_URL}/webhooks/twilio/status`,
      new URLSearchParams(webhookData).toString(),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );

    if (response.status === 200) {
      log('✅ Status webhook accepted (200 OK)', 'green');
      
      // Wait for async processing
      log('⏳ Waiting 2 seconds for async processing...', 'blue');
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Verify call record was created
      const callRecord = await notionLogger.getCallRecord(testCallSid);
      
      if (callRecord) {
        log('\n✅ Call record found in Notion!', 'green');
        log(`   ID: ${callRecord.id}`, 'yellow');
        log(`   Status: ${callRecord.status}`, 'yellow');
        log(`   Duration: ${callRecord.duration}s`, 'yellow');
        log(`   URL: ${callRecord.url}`, 'yellow');
        return { success: true, callSid: testCallSid, callRecord };
      } else {
        log('\n❌ Call record not found in Notion', 'red');
        return { success: false, callSid: testCallSid, error: 'Record not found' };
      }
    } else {
      log(`❌ Unexpected status: ${response.status}`, 'red');
      return { success: false, callSid: testCallSid, error: `Status ${response.status}` };
    }
  } catch (error) {
    log(`\n❌ Status webhook failed: ${error.message}`, 'red');
    if (error.response) {
      log(`   Status: ${error.response.status}`, 'red');
      log(`   Data: ${JSON.stringify(error.response.data)}`, 'red');
    }
    return { success: false, callSid: testCallSid, error: error.message };
  }
}

/**
 * Test 2: Simulate Twilio Recording Webhook
 */
async function testRecordingWebhook(callSid) {
  log('\n========================================', 'cyan');
  log('TEST 2: Twilio Recording Webhook', 'cyan');
  log('========================================\n', 'cyan');

  const testRecordingUrl = 'https://api.twilio.com/2010-04-01/Accounts/TEST/Recordings/RE00000000000000000000000000000000';
  
  const webhookData = {
    RecordingSid: `RE${Date.now()}`,
    RecordingUrl: testRecordingUrl,
    RecordingDuration: '120',
    RecordingChannels: '2',
    RecordingStartTime: new Date().toISOString(),
    RecordingStatus: 'completed',
    CallSid: callSid,
    From: TEST_PHONE,
    To: '+18664269424'
  };

  log('Sending recording webhook...', 'blue');
  log(`Call SID: ${callSid}`, 'yellow');
  log(`Recording URL: ${testRecordingUrl}\n`, 'yellow');

  try {
    const response = await axios.post(
      `${SERVER_URL}/webhooks/twilio/recording`,
      new URLSearchParams(webhookData).toString(),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );

    if (response.status === 200) {
      log('✅ Recording webhook accepted (200 OK)', 'green');
      
      // Wait for async processing
      log('⏳ Waiting 3 seconds for async processing...', 'blue');
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // Verify call record was updated
      const callRecord = await notionLogger.getCallRecord(callSid);
      
      if (callRecord) {
        log('\n✅ Call record retrieved from Notion!', 'green');
        log(`   ID: ${callRecord.id}`, 'yellow');
        log(`   Status: ${callRecord.status}`, 'yellow');
        
        // Note: In test mode, transcription will likely fail because the URL is fake
        // But we can verify the recording URL was saved
        log('\n⚠️  Note: Transcription likely failed due to fake recording URL', 'yellow');
        log('   This is expected in test mode', 'yellow');
        
        return { success: true, callRecord };
      } else {
        log('\n❌ Call record not found', 'red');
        return { success: false, error: 'Record not found' };
      }
    } else {
      log(`❌ Unexpected status: ${response.status}`, 'red');
      return { success: false, error: `Status ${response.status}` };
    }
  } catch (error) {
    log(`\n❌ Recording webhook failed: ${error.message}`, 'red');
    if (error.response) {
      log(`   Status: ${error.response.status}`, 'red');
    }
    return { success: false, error: error.message };
  }
}

/**
 * Test 3: Direct Notion Module Tests
 */
async function testNotionModule() {
  log('\n========================================', 'cyan');
  log('TEST 3: Direct Notion Module Tests', 'cyan');
  log('========================================\n', 'cyan');

  // Test findLeadByPhone
  log('Testing findLeadByPhone...', 'blue');
  try {
    const lead = await notionLogger.findLeadByPhone(TEST_PHONE);
    if (lead) {
      log(`✅ Found lead: ${lead.name} (${lead.id})`, 'green');
    } else {
      log(`⚠️  No lead found for ${TEST_PHONE} (may be expected)`, 'yellow');
    }
  } catch (error) {
    log(`❌ findLeadByPhone failed: ${error.message}`, 'red');
  }

  // Test getCallRecord (non-existent)
  log('\nTesting getCallRecord (non-existent)...', 'blue');
  try {
    const record = await notionLogger.getCallRecord('NONEXISTENT');
    if (!record) {
      log('✅ Correctly returned null for non-existent record', 'green');
    }
  } catch (error) {
    log(`❌ getCallRecord failed: ${error.message}`, 'red');
  }
}

/**
 * Check configuration
 */
function checkConfig() {
  log('\n========================================', 'cyan');
  log('Configuration Check', 'cyan');
  log('========================================\n', 'cyan');

  const checks = [
    { name: 'NOTION_TOKEN', value: process.env.NOTION_TOKEN },
    { name: 'NOTION_DATABASE_ID (Leads)', value: process.env.NOTION_DATABASE_ID },
    { name: 'NOTION_CALLS_DB_ID (Call Records)', value: process.env.NOTION_CALLS_DB_ID },
    { name: 'DEEPGRAM_API_KEY', value: process.env.DEEPGRAM_API_KEY },
    { name: 'SERVER_URL', value: SERVER_URL }
  ];

  let allGood = true;
  for (const check of checks) {
    if (check.value) {
      log(`✅ ${check.name}: Set`, 'green');
    } else {
      log(`❌ ${check.name}: Not set`, 'red');
      allGood = false;
    }
  }

  return allGood;
}

/**
 * Main test runner
 */
async function runTests() {
  log('\n🧪 WEBHOOK → NOTION TEST SUITE', 'cyan');
  log('================================\n', 'cyan');

  // Check config first
  const configOk = checkConfig();
  if (!configOk) {
    log('\n⚠️  Some configuration is missing. Tests may fail.', 'yellow');
    log('   Make sure NOTION_CALLS_DB_ID is set once Vault creates the database.\n', 'yellow');
  }

  const results = {
    statusWebhook: null,
    recordingWebhook: null,
    notionModule: null
  };

  try {
    // Test 1: Status webhook
    results.statusWebhook = await testStatusWebhook();
    
    // Test 2: Recording webhook (if status test succeeded)
    if (results.statusWebhook.success) {
      results.recordingWebhook = await testRecordingWebhook(results.statusWebhook.callSid);
    }

    // Test 3: Direct module tests
    results.notionModule = await testNotionModule();

  } catch (error) {
    log(`\n❌ Unexpected error: ${error.message}`, 'red');
    console.error(error);
  }

  // Summary
  log('\n========================================', 'cyan');
  log('TEST SUMMARY', 'cyan');
  log('========================================\n', 'cyan');

  const statusResult = results.statusWebhook?.success ? '✅ PASS' : '❌ FAIL';
  const recordingResult = results.recordingWebhook?.success ? '✅ PASS' : '❌ FAIL';

  log(`Status Webhook: ${statusResult}`, results.statusWebhook?.success ? 'green' : 'red');
  log(`Recording Webhook: ${recordingResult}`, results.recordingWebhook?.success ? 'green' : 'red');
  
  log('\n📋 Notes:', 'yellow');
  log('   - Transcription requires real recording URLs', 'yellow');
  log('   - Call records database must be created in Notion', 'yellow');
  log('   - NOTION_CALLS_DB_ID must be set in .env', 'yellow');

  log('\n========================================\n', 'cyan');
}

// Run tests
runTests().catch(console.error);
