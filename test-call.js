/**
 * Test Script for Call Initiator - ElevenLabs API Version
 * Initiates a single test call using ElevenLabs API
 * 
 * Usage: node test-call.js
 * 
 * Required Environment Variables:
 * - ELEVENLABS_API_KEY: Your ElevenLabs API key
 * - TWILIO_PHONE_NUMBER: Your Twilio phone number (controlled by ElevenLabs)
 * - TEST_LEAD_PHONE: Phone number to call for testing
 * 
 * Optional Environment Variables:
 * - TEST_LEAD_NAME: Name of the test lead (default: "Test Lead")
 * - TEST_LEAD_ADDRESS: Address for the test lead (default: "123 Test St")
 */

require('dotenv').config();
const { initiateCall } = require('./lib/callInitiator');

// Test configuration
const TEST_CONFIG = {
  leadPhone: process.env.TEST_LEAD_PHONE,
  leadName: process.env.TEST_LEAD_NAME || 'Test Lead',
  leadAddress: process.env.TEST_LEAD_ADDRESS || '123 Test Street, Test City'
};

async function runTest() {
  console.log('═══════════════════════════════════════════════════');
  console.log('  🤖 AI Calling System - Test Call (ElevenLabs)');
  console.log('═══════════════════════════════════════════════════');
  console.log();

  // Validate required environment variables
  const requiredEnvVars = [
    'ELEVENLABS_API_KEY',
    'TWILIO_PHONE_NUMBER',
    'TEST_LEAD_PHONE'
  ];

  const missingVars = requiredEnvVars.filter(varName => !process.env[varName] || process.env[varName].includes('your_'));
  
  if (missingVars.length > 0) {
    console.error('❌ Missing required environment variables:');
    missingVars.forEach(varName => console.error(`   - ${varName}`));
    console.log();
    console.log('Please set these variables in your .env file:');
    console.log('  ELEVENLABS_API_KEY=your_elevenlabs_api_key');
    console.log('  TWILIO_PHONE_NUMBER=+18664269424');
    console.log('  TEST_LEAD_PHONE=+12133351297');
    process.exit(1);
  }

  // Display test configuration
  console.log('📋 Test Configuration:');
  console.log(`   Lead Name:    ${TEST_CONFIG.leadName}`);
  console.log(`   Lead Phone:   ${TEST_CONFIG.leadPhone}`);
  console.log(`   Lead Address: ${TEST_CONFIG.leadAddress}`);
  console.log(`   From Number:  ${process.env.TWILIO_PHONE_NUMBER}`);
  console.log();

  // Confirm before placing the call
  console.log('⚠️  About to initiate an outbound call!');
  console.log('   This will use ElevenLabs credits.');
  console.log();
  
  try {
    console.log('🚀 Initiating call via ElevenLabs API...');
    console.log();

    const callId = await initiateCall(
      TEST_CONFIG.leadPhone,
      TEST_CONFIG.leadName,
      TEST_CONFIG.leadAddress
    );

    console.log();
    console.log('✅ Call initiated successfully!');
    console.log(`   Call ID: ${callId}`);
    console.log();
    console.log('📊 Your phone should ring shortly!');
    console.log('   Answer and talk to your AI agent.');
    console.log();
    console.log('═══════════════════════════════════════════════════');
    console.log('  ✅ Test call sent!');
    console.log('═══════════════════════════════════════════════════');

  } catch (error) {
    console.error();
    console.error('❌ Test failed:');
    console.error(`   ${error.message}`);
    console.error();
    process.exit(1);
  }
}

// Run the test
runTest();
