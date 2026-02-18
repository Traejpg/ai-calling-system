/**
 * Notion Service Tests
 */

const NotionService = require('../src/services/notion');

describe('NotionService', () => {
  let service;

  beforeEach(() => {
    service = new NotionService();
  });

  describe('getPropertyValue', () => {
    it('should extract title value', () => {
      const prop = {
        type: 'title',
        title: [{ plain_text: 'John Doe' }]
      };
      expect(service.getPropertyValue(prop)).toBe('John Doe');
    });

    it('should extract select value', () => {
      const prop = {
        type: 'select',
        select: { name: 'Hot' }
      };
      expect(service.getPropertyValue(prop)).toBe('Hot');
    });

    it('should extract phone number', () => {
      const prop = {
        type: 'phone_number',
        phone_number: '+13125551234'
      };
      expect(service.getPropertyValue(prop)).toBe('+13125551234');
    });

    it('should extract number value', () => {
      const prop = {
        type: 'number',
        number: 85
      };
      expect(service.getPropertyValue(prop)).toBe(85);
    });

    it('should handle null property', () => {
      expect(service.getPropertyValue(null)).toBeNull();
    });

    it('should handle empty property', () => {
      const prop = {
        type: 'title',
        title: []
      };
      expect(service.getPropertyValue(prop)).toBeNull();
    });
  });

  describe('formatLead', () => {
    it('should format lead from Notion page', () => {
      const page = {
        id: 'test-id-123',
        url: 'https://notion.so/test',
        properties: {
          'Name': { type: 'title', title: [{ plain_text: 'John Doe' }] },
          'Phone': { type: 'phone_number', phone_number: '+13125551234' },
          'Lead Score': { type: 'number', number: 85 },
          'Temperature': { type: 'select', select: { name: 'Hot' } },
          'DNC': { type: 'checkbox', checkbox: false }
        }
      };

      const lead = service.formatLead(page);
      
      expect(lead.id).toBe('test-id-123');
      expect(lead.name).toBe('John Doe');
      expect(lead.phone).toBe('+13125551234');
      expect(lead.leadScore).toBe(85);
      expect(lead.temperature).toBe('Hot');
      expect(lead.dnc).toBe(false);
    });
  });
});