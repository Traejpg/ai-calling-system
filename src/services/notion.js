/**
 * Notion Integration Service
 * 
 * Manages lead database, call records, and automation workflows
 */

const { Client } = require('@notionhq/client');
const logger = require('../utils/logger');

class NotionService {
  constructor() {
    this.client = new Client({ auth: process.env.NOTION_API_KEY });
    this.leadsDatabaseId = process.env.NOTION_LEADS_DATABASE_ID;
    this.callRecordsDatabaseId = process.env.NOTION_CALL_RECORDS_DATABASE_ID;
  }

  /**
   * Query leads ready for calling
   * Criteria: Hot leads (80+ score), not called in 48hrs, not DNC
   * @param {number} limit - Max results
   * @returns {Promise<Array>} - Leads to call
   */
  async getLeadsForCalling(limit = 10) {
    try {
      const cooldownHours = parseInt(process.env.CALL_COOLDOWN_HOURS) || 48;
      const cutoffDate = new Date();
      cutoffDate.setHours(cutoffDate.getHours() - cooldownHours);
      const cutoffDateString = cutoffDate.toISOString();

      const response = await this.client.databases.query({
        database_id: this.leadsDatabaseId,
        filter: {
          and: [
            {
              property: 'Temperature',
              select: {
                equals: 'Hot'
              }
            },
            {
              property: 'Lead Score',
              number: {
                greater_than_or_equal_to: 80
              }
            },
            {
              property: 'DNC',
              checkbox: {
                does_not_equal: true
              }
            },
            {
              or: [
                {
                  property: 'Last Called',
                  date: {
                    before: cutoffDateString
                  }
                },
                {
                  property: 'Last Called',
                  date: {
                    is_empty: true
                  }
                }
              ]
            }
          ]
        },
        sorts: [
          {
            property: 'Lead Score',
            direction: 'descending'
          }
        ],
        page_size: limit
      });

      const leads = response.results.map(page => this.formatLead(page));
      
      logger.info(`Found ${leads.length} leads ready for calling`);
      
      return leads;

    } catch (error) {
      logger.error('Failed to query leads', { error: error.message });
      return [];
    }
  }

  /**
   * Format Notion page to lead object
   */
  formatLead(page) {
    const props = page.properties;
    
    return {
      id: page.id,
      url: page.url,
      name: this.getPropertyValue(props['Name']),
      address: this.getPropertyValue(props['Address']),
      phone: this.getPropertyValue(props['Phone']),
      email: this.getPropertyValue(props['Email']),
      leadScore: this.getPropertyValue(props['Lead Score']),
      temperature: this.getPropertyValue(props['Temperature']),
      status: this.getPropertyValue(props['Status']),
      lastCalled: this.getPropertyValue(props['Last Called']),
      dnc: this.getPropertyValue(props['DNC']),
      taxSaleAmount: this.getPropertyValue(props['Tax Sale Amount']),
      notes: this.getPropertyValue(props['Notes'])
    };
  }

  /**
   * Get property value from Notion property
   */
  getPropertyValue(property) {
    if (!property) return null;
    
    const type = property.type;
    
    switch (type) {
      case 'title':
        return property.title?.[0]?.plain_text || null;
      case 'rich_text':
        return property.rich_text?.[0]?.plain_text || null;
      case 'number':
        return property.number;
      case 'select':
        return property.select?.name || null;
      case 'multi_select':
        return property.multi_select?.map(s => s.name) || [];
      case 'date':
        return property.date?.start || null;
      case 'checkbox':
        return property.checkbox;
      case 'phone_number':
        return property.phone_number;
      case 'email':
        return property.email;
      case 'url':
        return property.url;
      case 'relation':
        return property.relation?.map(r => r.id) || [];
      default:
        return null;
    }
  }

  /**
   * Create a new call record
   */
  async createCallRecord(callData) {
    try {
      const page = await this.client.pages.create({
        parent: {
          database_id: process.env.NOTION_CALL_RECORDS_DATABASE_ID
        },
        properties: {
          'Call ID': {
            title: [{ text: { content: callData.callId || `CALL-${Date.now()}` } }]
          },
          'Lead': {
            relation: callData.leadId ? [{ id: callData.leadId }] : []
          },
          'Phone Number': { phone_number: callData.phoneNumber },
          'Call Date': { date: { start: callData.callDate || new Date().toISOString() } },
          'Duration': { number: callData.duration || 0 },
          'Status': { select: { name: callData.status || 'Completed' } },
          'Lead Temperature': { select: { name: callData.leadTemperature || 'Warm' } },
          'Twilio Call SID': { rich_text: [{ text: { content: callData.callSid || '' } }] },
          'Recording URL': { url: callData.recordingUrl || null }
        }
      });

      logger.info('Call record created', { pageId: page.id, callSid: callData.callSid });
      
      return { success: true, id: page.id, url: page.url };

    } catch (error) {
      logger.error('Failed to create call record', { error: error.message });
      return { success: false, error: error.message };
    }
  }

  /**
   * Update call record with transcription results
   */
  async updateCallRecordWithTranscript(pageId, transcriptData) {
    try {
      const properties = {
        'Transcript': { rich_text: [{ text: { content: transcriptData.fullText?.substring(0, 2000) || '' } }] },
        'Summary': { rich_text: [{ text: { content: transcriptData.summary?.substring(0, 2000) || '' } }] },
        'Sentiment': { select: { name: this.capitalizeFirst(transcriptData.sentiment?.overall) || 'Neutral' } },
        'Key Events': { multi_select: transcriptData.keyEvents?.map(e => ({ name: this.formatKeyEventName(e.type) })) || [] },
        'Quality Score': { number: transcriptData.callQuality?.score || 0 },
        'Next Action': { rich_text: [{ text: { content: transcriptData.nextAction || '' } }] }
      };

      if (transcriptData.status && transcriptData.status !== 'Completed') {
        properties['Status'] = { select: { name: transcriptData.status } };
        properties['Lead Temperature'] = { select: { name: transcriptData.leadTemperature || 'Warm' } };
      }

      await this.client.pages.update({ page_id: pageId, properties });
      logger.info('Call record updated with transcript', { pageId });
      
      return { success: true };

    } catch (error) {
      logger.error('Failed to update call record', { pageId, error: error.message });
      return { success: false, error: error.message };
    }
  }

  /**
   * Update lead record after call
   */
  async updateLeadAfterCall(leadId, callOutcome) {
    try {
      const properties = {
        'Last Called': { date: { start: new Date().toISOString() } }
      };

      if (callOutcome.leadTemperature) {
        properties['Temperature'] = { select: { name: callOutcome.leadTemperature } };
      }

      if (callOutcome.status) {
        properties['Status'] = { select: { name: callOutcome.status } };
      }

      if (callOutcome.status === 'DNC') {
        properties['DNC'] = { checkbox: true };
      }

      if (callOutcome.summary) {
        const existingNotes = await this.getLeadNotes(leadId);
        const newNote = `[${new Date().toLocaleDateString()}] ${callOutcome.status}: ${callOutcome.summary}`;
        properties['Notes'] = { rich_text: [{ text: { content: `${newNote}\n\n${existingNotes || ''}`.substring(0, 2000) } }] };
      }

      await this.client.pages.update({ page_id: leadId, properties });
      logger.info('Lead record updated', { leadId, status: callOutcome.status });
      
      return { success: true };

    } catch (error) {
      logger.error('Failed to update lead', { leadId, error: error.message });
      return { success: false, error: error.message };
    }
  }

  async getLeadNotes(leadId) {
    try {
      const page = await this.client.pages.retrieve({ page_id: leadId });
      return this.getPropertyValue(page.properties['Notes']);
    } catch (error) {
      return '';
    }
  }

  /**
   * Get call records for daily summary
   */
  async getDailyCalls(date) {
    try {
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);

      const response = await this.client.databases.query({
        database_id: process.env.NOTION_CALL_RECORDS_DATABASE_ID,
        filter: {
          and: [
            { property: 'Call Date', date: { on_or_after: startOfDay.toISOString() } },
            { property: 'Call Date', date: { on_or_before: endOfDay.toISOString() } }
          ]
        }
      });

      return response.results.map(page => ({
        id: page.id,
        ...this.formatCallRecord(page)
      }));

    } catch (error) {
      logger.error('Failed to get daily calls', { error: error.message });
      return [];
    }
  }

  formatCallRecord(page) {
    const props = page.properties;
    return {
      callId: this.getPropertyValue(props['Call ID']),
      phone: this.getPropertyValue(props['Phone Number']),
      status: this.getPropertyValue(props['Status']),
      duration: this.getPropertyValue(props['Duration']),
      sentiment: this.getPropertyValue(props['Sentiment']),
      qualityScore: this.getPropertyValue(props['Quality Score'])
    };
  }

  capitalizeFirst(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  formatKeyEventName(eventType) {
    return eventType
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  /**
   * Find lead by phone number
   * @param {string} phone - Phone number to search for
   * @returns {Promise<Object|null>} - Lead data or null
   */
  async findLeadByPhone(phone) {
    try {
      // Format phone number for consistent matching
      const formattedPhone = phone.replace(/\D/g, '');
      
      const response = await this.client.databases.query({
        database_id: this.leadsDatabaseId,
        filter: {
          or: [
            { property: 'Phone', phone_number: { equals: phone } },
            { property: 'Phone', phone_number: { contains: formattedPhone.slice(-10) } }
          ]
        },
        page_size: 1
      });

      if (response.results.length > 0) {
        const lead = this.formatLead(response.results[0]);
        logger.info('Found lead by phone', { phone, leadId: lead.id, name: lead.name });
        return lead;
      }

      logger.info('No lead found for phone', { phone });
      return null;

    } catch (error) {
      logger.error('Failed to find lead by phone', { phone, error: error.message });
      return null;
    }
  }
}

module.exports = NotionService;