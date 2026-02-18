/**
 * Test Script for Notion Integration
 * Run with: node test-notion.js
 * 
 * Required environment variables:
 * - NOTION_API_TOKEN: Your Notion integration token
 * - NOTION_LEADS_DB_ID: Tax Sale Leads database ID
 * - NOTION_CALLS_DB_ID: Call Records database ID (optional, can use same as leads)
 * - NOTION_DATABASE_ID: Fallback database ID (6bfe2b03-ad24-4de6-8df3-c63d01f4ad12)
 */

const notion = require('./lib/notion');

// ANSI color codes for output
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

function logSection(title) {
  console.log('');
  log('='.repeat(60), 'cyan');
  log(`  ${title}`, 'cyan');
  log('='.repeat(60), 'cyan');
  console.log('');
}

async function checkEnvironment() {
  logSection('Environment Check');
  
  const required = ['NOTION_API_TOKEN', 'NOTION_DATABASE_ID'];
  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    log('❌ Missing required environment variables:', 'red');
    missing.forEach(key => log(`   - ${key}`, 'red'));
    log('\nSet them like this:', 'yellow');
    log('export NOTION_API_TOKEN=secret_xxx', 'yellow');
    log('export NOTION_DATABASE_ID=6bfe2b03-ad24-4de6-8df3-c63d01f4ad12', 'yellow');
    return false;
  }
  
  log('✅ Environment variables configured', 'green');
  log(`   NOTION_DATABASE_ID: ${process.env.NOTION_DATABASE_ID}`, 'blue');
  return true;
}

async function testGetHotLeads() {
  logSection('Test: getHotLeads()');
  log('Fetching hot leads (score >= 80, not called in 48hrs, not DNC)...', 'blue');
  
  const result = await notion.getHotLeads();
  
  if (!result.success) {
    log(`❌ Failed: ${JSON.stringify(result.error, null, 2)}`, 'red');
    return false;
  }
  
  log(`✅ Found ${result.count} hot lead(s)`, 'green');
  
  if (result.leads.length > 0) {
    log('\nHot Leads:', 'cyan');
    result.leads.forEach((lead, idx) => {
      console.log(`  ${idx + 1}. ${lead.name}`);
      console.log(`     Score: ${lead.score} | Temperature: ${lead.temperature}`);
      console.log(`     Phone: ${lead.phone || 'N/A'}`);
      console.log(`     ID: ${lead.id}`);
      console.log('');
    });
  }
  
  return result.leads;
}

async function testUpdateLeadStatus(leadId) {
  logSection('Test: updateLeadStatus()');
  log(`Updating lead: ${leadId}`, 'blue');
  
  const result = await notion.updateLeadStatus(
    leadId,
    'Callback Requested',
    'Hot'
  );
  
  if (!result.success) {
    log(`❌ Failed: ${JSON.stringify(result.error, null, 2)}`, 'red');
    return false;
  }
  
  log('✅ Lead status updated successfully', 'green');
  log(`   Call Attempts: ${result.callAttempts}`, 'blue');
  log(`   Temperature: ${result.temperature}`, 'blue');
  
  return true;
}

async function testCreateCallRecord(leadId) {
  logSection('Test: createCallRecord()');
  log(`Creating call record for lead: ${leadId}`, 'blue');
  
  const callData = {
    duration: '3:45',
    outcome: 'Interested',
    notes: 'Lead expressed interest in selling. Follow up next week.',
    recordingUrl: 'https://example.com/recordings/call-001.mp3'
  };
  
  const result = await notion.createCallRecord(leadId, callData);
  
  if (!result.success) {
    log(`❌ Failed: ${JSON.stringify(result.error, null, 2)}`, 'red');
    return false;
  }
  
  log('✅ Call record created successfully', 'green');
  log(`   Record ID: ${result.id}`, 'blue');
  log(`   URL: ${result.url}`, 'blue');
  
  return result.id;
}

async function testGetLead(leadId) {
  logSection('Test: getLead()');
  log(`Fetching lead: ${leadId}`, 'blue');
  
  const result = await notion.getLead(leadId);
  
  if (!result.success) {
    log(`❌ Failed: ${JSON.stringify(result.error, null, 2)}`, 'red');
    return false;
  }
  
  log('✅ Lead fetched successfully', 'green');
  log(`   Name: ${result.name}`, 'blue');
  log(`   Phone: ${result.phone || 'N/A'}`, 'blue');
  log(`   Score: ${result.score}`, 'blue');
  log(`   Temperature: ${result.temperature}`, 'blue');
  log(`   Call Attempts: ${result.callAttempts}`, 'blue');
  
  return result;
}

async function runTests() {
  console.log('');
  log('╔══════════════════════════════════════════════════════════╗', 'cyan');
  log('║        NOTION INTEGRATION TEST SUITE                     ║', 'cyan');
  log('╚══════════════════════════════════════════════════════════╝', 'cyan');
  console.log('');
  
  // Check environment first
  if (!(await checkEnvironment())) {
    process.exit(1);
  }
  
  const testResults = {
    getHotLeads: false,
    getLead: false,
    updateLeadStatus: false,
    createCallRecord: false
  };
  
  // Test 1: Get Hot Leads
  const hotLeads = await testGetHotLeads();
  testResults.getHotLeads = !!hotLeads;
  
  // If we have leads, test with the first one
  let testLeadId = null;
  if (hotLeads && hotLeads.length > 0) {
    testLeadId = hotLeads[0].id;
  } else {
    // Use a fallback ID from env for testing
    testLeadId = process.env.TEST_LEAD_ID;
    if (testLeadId) {
      log('\n⚠️  Using TEST_LEAD_ID from environment for remaining tests', 'yellow');
    }
  }
  
  if (testLeadId) {
    // Test 2: Get Lead
    testResults.getLead = await testGetLead(testLeadId);
    
    // Test 3: Update Lead Status
    testResults.updateLeadStatus = await testUpdateLeadStatus(testLeadId);
    
    // Test 4: Create Call Record
    testResults.createCallRecord = await testCreateCallRecord(testLeadId);
  } else {
    log('\n⚠️  No leads found and no TEST_LEAD_ID set. Skipping lead-specific tests.', 'yellow');
    log('Set TEST_LEAD_ID to test update and create operations.', 'yellow');
  }
  
  // Summary
  logSection('Test Summary');
  const passed = Object.values(testResults).filter(v => v).length;
  const total = Object.keys(testResults).length;
  
  Object.entries(testResults).forEach(([test, result]) => {
    const icon = result ? '✅' : '❌';
    const color = result ? 'green' : 'red';
    log(`${icon} ${test}: ${result ? 'PASSED' : 'FAILED'}`, color);
  });
  
  console.log('');
  log(`Total: ${passed}/${total} tests passed`, passed === total ? 'green' : 'yellow');
  
  process.exit(passed === total ? 0 : 1);
}

// Handle errors
process.on('unhandledRejection', (error) => {
  console.error('Unhandled error:', error);
  process.exit(1);
});

// Run tests
runTests();
