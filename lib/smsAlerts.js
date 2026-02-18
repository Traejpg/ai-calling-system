/**
 * SMS Alerts Module
 * 
 * Sends SMS alerts for appointments, complaints, and issues
 * Uses Twilio for SMS delivery
 */

const TwilioService = require('../src/services/twilio');
const logger = require('../src/utils/logger');

class SMSAlerts {
  constructor() {
    this.twilio = new TwilioService();
    this.alertPhone = process.env.ALERT_PHONE_NUMBER;
    this.twilioPhone = process.env.TWILIO_PHONE_NUMBER;
  }

  /**
   * Check if alerts are configured
   * @returns {boolean}
   */
  isConfigured() {
    return !!this.alertPhone && !!this.twilioPhone;
  }

  /**
   * Send appointment booked alert
   * @param {Object} appointmentData - Appointment details
   * @param {string} appointmentData.leadName - Lead name
   * @param {string} appointmentData.phone - Lead phone number
   * @param {string} appointmentData.address - Property address
   * @param {string} appointmentData.date - Appointment date
   * @param {string} appointmentData.time - Appointment time
   * @param {string} appointmentData.callRecordUrl - URL to call record
   */
  async sendAppointmentAlert(appointmentData) {
    if (!this.isConfigured()) {
      logger.warn('SMS alerts not configured - missing ALERT_PHONE_NUMBER or TWILIO_PHONE_NUMBER');
      return { success: false, error: 'SMS alerts not configured' };
    }

    const message = `🏠 APPOINTMENT BOOKED!

Lead: ${appointmentData.leadName || 'N/A'}
Phone: ${appointmentData.phone || 'N/A'}
Address: ${appointmentData.address || 'N/A'}
Date: ${appointmentData.date || 'TBD'}
Time: ${appointmentData.time || 'TBD'}

${appointmentData.callRecordUrl ? `Record: ${appointmentData.callRecordUrl}` : ''}`;

    return this.sendSMS(message, 'appointment');
  }

  /**
   * Send complaint/issue alert
   * @param {Object} complaintData - Complaint details
   * @param {string} complaintData.leadName - Lead name
   * @param {string} complaintData.phone - Lead phone number
   * @param {string} complaintData.issue - Issue description
   * @param {string} complaintData.transcriptExcerpt - Excerpt from transcript
   * @param {string} complaintData.callRecordUrl - URL to call record
   */
  async sendComplaintAlert(complaintData) {
    if (!this.isConfigured()) {
      logger.warn('SMS alerts not configured');
      return { success: false, error: 'SMS alerts not configured' };
    }

    const excerpt = complaintData.transcriptExcerpt 
      ? complaintData.transcriptExcerpt.substring(0, 100) + '...'
      : 'N/A';

    const message = `⚠️ COMPLAINT/ISSUE ALERT

Lead: ${complaintData.leadName || 'N/A'}
Phone: ${complaintData.phone || 'N/A'}
Issue: ${complaintData.issue || 'Complaint raised'}

Excerpt: "${excerpt}"

${complaintData.callRecordUrl ? `Record: ${complaintData.callRecordUrl}` : ''}

ACTION REQUIRED`;

    return this.sendSMS(message, 'complaint');
  }

  /**
   * Send DNC request alert
   * @param {Object} dncData - DNC request details
   * @param {string} dncData.leadName - Lead name
   * @param {string} dncData.phone - Lead phone number
   * @param {string} dncData.callRecordUrl - URL to call record
   */
  async sendDNCAlert(dncData) {
    if (!this.isConfigured()) {
      logger.warn('SMS alerts not configured');
      return { success: false, error: 'SMS alerts not configured' };
    }

    const message = `🚫 DNC REQUEST

Lead: ${dncData.leadName || 'N/A'}
Phone: ${dncData.phone || 'N/A'}
Action: Lead requested removal from call list

Status updated in Notion automatically.`;

    return this.sendSMS(message, 'dnc');
  }

  /**
   * Send call failure alert (for manual review)
   * @param {Object} failureData - Failure details
   * @param {string} failureData.callSid - Twilio call SID
   * @param {string} failureData.phone - Phone number
   * @param {string} failureData.reason - Failure reason
   * @param {string} failureData.error - Error details
   */
  async sendFailureAlert(failureData) {
    if (!this.isConfigured()) {
      logger.warn('SMS alerts not configured');
      return { success: false, error: 'SMS alerts not configured' };
    }

    const message = `❌ CALL FAILED - REVIEW NEEDED

Call SID: ${failureData.callSid || 'N/A'}
Phone: ${failureData.phone || 'N/A'}
Reason: ${failureData.reason || 'Unknown'}

${failureData.error ? `Error: ${failureData.error.substring(0, 100)}` : ''}

Flagged for manual review in Notion.`;

    return this.sendSMS(message, 'failure');
  }

  /**
   * Send high-priority lead alert (Hot lead with strong interest)
   * @param {Object} leadData - Lead details
   * @param {string} leadData.leadName - Lead name
   * @param {string} leadData.phone - Lead phone number
   * @param {string} leadData.address - Property address
   * @param {string} leadData.notes - Why this is high priority
   */
  async sendHotLeadAlert(leadData) {
    if (!this.isConfigured()) {
      logger.warn('SMS alerts not configured');
      return { success: false, error: 'SMS alerts not configured' };
    }

    const message = `🔥 HOT LEAD ALERT

Lead: ${leadData.leadName || 'N/A'}
Phone: ${leadData.phone || 'N/A'}
Address: ${leadData.address || 'N/A'}

${leadData.notes ? `Notes: ${leadData.notes.substring(0, 100)}` : 'Strong interest expressed'}

Follow up ASAP!`;

    return this.sendSMS(message, 'hot-lead');
  }

  /**
   * Send retry queue summary alert
   * @param {Object} summary - Queue summary
   * @param {number} summary.totalPending - Total pending retries
   * @param {number} summary.readyForRetry - Ready to retry now
   * @param {number} summary.permanentlyFailed - Permanently failed
   */
  async sendRetrySummary(summary) {
    if (!this.isConfigured()) {
      return { success: false, error: 'SMS alerts not configured' };
    }

    const message = `📊 Retry Queue Summary

Pending Retries: ${summary.totalPending || 0}
Ready Now: ${summary.readyForRetry || 0}
Permanently Failed: ${summary.permanentlyFailed || 0}

${summary.readyForRetry > 0 ? 'Processing retries now...' : 'No action needed'}`;

    return this.sendSMS(message, 'retry-summary');
  }

  /**
   * Internal method to send SMS
   * @param {string} message - Message body
   * @param {string} alertType - Type of alert for logging
   */
  async sendSMS(message, alertType = 'general') {
    try {
      const result = await this.twilio.sendSMS(this.alertPhone, message);
      
      if (result.success) {
        logger.info(`SMS alert sent successfully`, {
          type: alertType,
          to: this.alertPhone,
          messageSid: result.messageSid
        });
      } else {
        logger.error(`Failed to send SMS alert`, {
          type: alertType,
          error: result.error
        });
      }

      return result;
    } catch (error) {
      logger.error(`SMS alert error`, {
        type: alertType,
        error: error.message
      });
      return { success: false, error: error.message };
    }
  }

  /**
   * Send test alert to verify configuration
   */
  async sendTestAlert() {
    const message = `✅ AI Calling System - SMS Alert Test

Your SMS alert system is working correctly!
Time: ${new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' })}
Alert Phone: ${this.alertPhone || 'Not configured'}`;

    return this.sendSMS(message, 'test');
  }
}

// Singleton instance
let smsAlertsInstance = null;

function getSMSAlerts() {
  if (!smsAlertsInstance) {
    smsAlertsInstance = new SMSAlerts();
  }
  return smsAlertsInstance;
}

module.exports = { SMSAlerts, getSMSAlerts };