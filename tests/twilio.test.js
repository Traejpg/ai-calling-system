/**
 * Twilio Service Tests
 */

const TwilioService = require('../src/services/twilio');

describe('TwilioService', () => {
  let twilioService;

  beforeEach(() => {
    twilioService = new TwilioService();
  });

  describe('formatPhoneNumber', () => {
    it('should format 10-digit numbers', () => {
      const result = twilioService.formatPhoneNumber('3125551234');
      expect(result).toBe('+13125551234');
    });

    it('should format numbers with dashes', () => {
      const result = twilioService.formatPhoneNumber('312-555-1234');
      expect(result).toBe('+13125551234');
    });

    it('should format numbers with country code', () => {
      const result = twilioService.formatPhoneNumber('+13125551234');
      expect(result).toBe('+13125551234');
    });

    it('should format numbers with spaces', () => {
      const result = twilioService.formatPhoneNumber('(312) 555-1234');
      expect(result).toBe('+13125551234');
    });
  });

  describe('generateVoiceResponse', () => {
    it('should return valid TwiML', () => {
      const twiml = twilioService.generateVoiceResponse();
      expect(twiml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
      expect(twiml).toContain('<Response>');
      expect(twiml).toContain('<Connect>');
      expect(twiml).toContain('<Stream');
    });
  });

  describe('generateVoicemailResponse', () => {
    it('should return TwiML with voicemail message', () => {
      const twiml = twilioService.generateVoicemailResponse();
      expect(twiml).toContain('<Response>');
      expect(twiml).toContain('<Say');
      expect(twiml).toContain('Windy City Home Buyers');
      expect(twiml).toContain('<Hangup />');
    });
  });

  describe('isBusinessHours', () => {
    it('should return boolean', () => {
      const result = twilioService.isBusinessHours();
      expect(typeof result).toBe('boolean');
    });
  });
});