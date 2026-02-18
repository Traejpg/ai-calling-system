#!/usr/bin/env node
/**
 * Daily Summary Script
 * 
 * Generates and sends daily call statistics at 6 PM
 */

require('dotenv').config();
const logger = require('./src/utils/logger');
const NotionService = require('./src/services/notion');
const AlertService = require('./src/services/alerts');

async function main() {
  logger.info('Daily summary script started');

  const notion = new NotionService();
  const alerts = new AlertService();

  const today = new Date();
  const calls = await notion.getDailyCalls(today);

  // Calculate statistics
  const stats = {
    date: today.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
    totalCalls: calls.length,
    completed: calls.filter(c => c.status === 'Completed').length,
    voicemails: calls.filter(c => c.status === 'Voicemail Left').length,
    appointments: calls.filter(c => c.status === 'Appointment Scheduled').length,
    dnc: calls.filter(c => c.status === 'DNC').length,
    complaints: calls.filter(c => c.status === 'Complaint').length,
    avgQualityScore: 0,
    hotLeadsRemaining: 0
  };

  // Calculate average quality score
  const scores = calls.map(c => c.qualityScore).filter(s => s > 0);
  if (scores.length > 0) {
    stats.avgQualityScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  }

  // Get remaining hot leads count
  const hotLeads = await notion.getLeadsForCalling(100);
  stats.hotLeadsRemaining = hotLeads.length;

  logger.info('Daily statistics', stats);

  // Send summary alert
  await alerts.sendDailySummary(stats);

  logger.info('Daily summary completed');
  process.exit(0);
}

main().catch(error => {
  logger.error('Daily summary script failed', { error: error.message, stack: error.stack });
  process.exit(1);
});