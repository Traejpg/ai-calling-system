#!/usr/bin/env node
/**
 * Call Real Lead Script
 * Initiates outbound call to a specific lead from your database
 * 
 * Usage: node call-lead.js "Lead Name" "+PhoneNumber" "Property Address"
 * 
 * Example: node call-lead.js "Antoine Jennings" "+18595092982" "9004 S. Luella Ave, Chicago, IL 60617"
 */

require('dotenv').config();
const { initiateCall } = require('./lib/callInitiator');

// Get command line arguments
const args = process.argv.slice(2);

if (args.length < 3) {
  console.log('═══════════════════════════════════════════════════');
  console.log('  📞 Call Real Lead - Usage');
  console.log('═══════════════════════════════════════════════════');
  console.log();
  console.log('Usage: node call-lead.js "Lead Name" "+PhoneNumber" "Property Address"');
  console.log();
  console.log('Example:');
  console.log('  node call-lead.js "Antoine Jennings" "+18595092982" "9004 S. Luella Ave, Chicago, IL 60617"');
  console.log();
  process.exit(1);
}

const leadName = args[0];
const leadPhone = args[1];
const leadAddress = args[2];

async function callLead() {
  console.log('═══════════════════════════════════════════════════');
  console.log('  📞 Calling Real Lead');
  console.log('═══════════════════════════════════════════════════');
  console.log();
  console.log('📋 Lead Information:');
  console.log(`   Name:     ${leadName}`);
  console.log(`   Phone:    ${leadPhone}`);
  console.log(`   Address:  ${leadAddress}`);
  console.log(`   From:     ${process.env.TWILIO_PHONE_NUMBER || '+17739852082'}`);
  console.log();
  console.log('⚠️  This will initiate a REAL call to this lead.');
  console.log('   ElevenLabs credits will be used.');
  console.log();

  try {
    console.log('🚀 Initiating outbound call...');
    console.log();

    const callId = await initiateCall(leadPhone, leadName, leadAddress);

    console.log();
    console.log('✅ Call initiated successfully!');
    console.log(`   Call ID: ${callId}`);
    console.log();
    console.log('📊 The lead should receive the call shortly.');
    console.log('   You will get a transfer if they are HOT.');
    console.log();
    console.log('═══════════════════════════════════════════════════');
    console.log('  ✅ Call sent to lead!');
    console.log('═══════════════════════════════════════════════════');

  } catch (error) {
    console.error();
    console.error('❌ Call failed:');
    console.error(`   ${error.message}`);
    console.error();
    process.exit(1);
  }
}

// Run the call
callLead();