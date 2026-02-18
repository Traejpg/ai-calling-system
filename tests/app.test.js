/**
 * Test Suite for AI Calling System
 */

const request = require('supertest');
const app = require('../src/server');

describe('AI Calling System', () => {
  
  describe('Health Check', () => {
    it('should return 200 and status ok', async () => {
      const res = await request(app)
        .get('/health')
        .expect(200);
      
      expect(res.body.status).toBe('ok');
      expect(res.body.timestamp).toBeDefined();
    });
  });

  describe('Twilio Webhooks', () => {
    it('should return TwiML for voice webhook', async () => {
      const res = await request(app)
        .post('/webhooks/twilio/voice')
        .send({
          CallSid: 'test-call-sid',
          From: '+1234567890',
          To: '+18664269424'
        })
        .expect(200);
      
      expect(res.type).toBe('text/xml');
      expect(res.text).toContain('Response');
      expect(res.text).toContain('Connect');
    });

    it('should accept status callback', async () => {
      const res = await request(app)
        .post('/webhooks/twilio/status')
        .send({
          CallSid: 'test-call-sid',
          CallStatus: 'completed',
          CallDuration: '120'
        })
        .expect(200);
    });

    it('should accept recording callback', async () => {
      const res = await request(app)
        .post('/webhooks/twilio/recording')
        .send({
          RecordingSid: 'test-recording-sid',
          RecordingUrl: 'https://api.twilio.com/test',
          CallSid: 'test-call-sid'
        })
        .expect(200);
    });
  });

  describe('API Endpoints', () => {
    it('should get leads ready for calling', async () => {
      const res = await request(app)
        .get('/api/leads/ready')
        .expect(200);
      
      expect(res.body).toHaveProperty('count');
      expect(res.body).toHaveProperty('leads');
      expect(Array.isArray(res.body.leads)).toBe(true);
    });

    it('should reject trigger without phone number', async () => {
      const res = await request(app)
        .post('/api/calls/trigger')
        .send({})
        .expect(400);
      
      expect(res.body.error).toContain('Phone number required');
    });
  });

});