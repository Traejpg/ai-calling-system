/**
 * Alert Service
 * 
 * Sends SMS alerts for important events
 */

const TwilioService = require('./twilio');
const logger = require('../utils/logger');

class AlertService {
  constructor() {
    this.twilio = new TwilioService();
    this.alertPhone = process.env.ALERT_PHONE_NUMBER;
  }

  /**
   * Send appointment scheduled alert
   * @param {Object} callData - Call data with appointment details
   */
  async sendAppointmentAlert(callData) {
    const message = `🏠 APPOINTMENT SET! 

Lead: ${callData.leadName}
Phone: ${callData.phone}
Address: ${callData.address}
Date: ${callData.appointmentDate}
Time: ${callData.appointmentTime}

View call record: ${callData.callRecordUrl}`;

    return this.sendAlert(message);
  }

  /**
   * Send complaint/complex situation alert
   * @param {Object} callData - Call data
   * @param {string} reason - Reason for escalation
   */
  async sendEscalationAlert(callData, reason) {
    const message = `⚠️ ESCALATION REQUIRED

Lead: ${callData.leadName}
Phone: ${callData.phone}
Issue: ${reason}
Sentiment: ${callData.sentiment}

Transcript excerpt: ${callData.transcript?.substring(0, 100)}...

View full call: ${callData.callRecordUrl}`;

    return this.sendAlert(message);
  }

  /**
   * Send DNC alert
   * @param {Object} callData - Call data
   */
  async sendDNCAlert(callData) {
    const message = `🚫 DNC REQUEST

Lead: ${callData.leadName}
Phone: ${callData.phone}
Action: Removed from call list

Call record: ${callData.callRecordUrl}`;

    return this.sendAlert(message);
  }

  /**
   * Send daily summary
   * @param {Object} summary - Daily call statistics
   */
  async sendDailySummary(summary) {
    const message = `📊 Daily Call Summary - ${summary.date}

📞 Total Calls: ${summary.totalCalls}
✅ Completed: ${summary.completed}
📧 Voicemails: ${summary.voicemails}
🤝 Appointments: ${summary.appointments}
🚫 DNC: ${summary.dnc}
⚠️ Complaints: ${summary.complaints}

Avg Quality Score: ${summary.avgQualityScore}/100

Hot leads to call: ${summary.hotLeadsRemaining}`;

    return this.sendAlert(message);
  }

  /**
   * Send test alert
   */
  async sendTestAlert() {
    const message = `✅ AI Calling System Alert Test

Your alert system is working correctly!
Time: ${new Date().toLocaleString()}`;

    return this.sendAlert(message);
  }

  /**
   * Send generic alert
   * @param {string} message - Message to send
   */
  async sendAlert(message) {
    if (!this.alertPhone) {
      logger.warn('Alert phone number not configured');
      return { success: false, error: 'Alert phone not configured' };
    }

    try {
      const result = await this.twilio.sendSMS(this.alertPhone, message);
      
      if (result.success) {
        logger.info('Alert sent successfully', { 
          to: this.alertPhone,
          messageSid: result.messageSid 
        });
      } else {
        logger.error('Failed to send alert', { error: result.error });
      }

      return result;

    } catch (error) {
      logger.error('Alert service error', { error: error.message });
      return { success: false, error: error.message };
    }
  }
}

module.exports = AlertService;