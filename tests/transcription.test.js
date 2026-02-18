/**
 * Transcription Service Tests
 */

const TranscriptionService = require('../src/services/transcription');

describe('TranscriptionService', () => {
  let service;

  beforeEach(() => {
    service = new TranscriptionService();
  });

  describe('formatTranscript', () => {
    it('should format Deepgram result correctly', () => {
      const mockResult = {
        metadata: { duration: 60, language: 'en-US' },
        results: {
          channels: [{
            alternatives: [{
              transcript: 'Hello this is Alex',
              confidence: 0.95,
              words: [{ word: 'Hello' }, { word: 'this' }]
            }]
          }],
          utterances: [
            { speaker: 0, transcript: 'Hello this is Alex', start: 0, end: 3, confidence: 0.95 }
          ],
          summary: { short: 'Test summary' },
          topics: [{ topic: 'real estate', confidence: 0.8 }],
          sentiment: { segments: [{ sentiment: 'positive' }] }
        }
      };

      const result = service.formatTranscript(mockResult);
      
      expect(result.fullText).toBe('Hello this is Alex');
      expect(result.duration).toBe(60);
      expect(result.wordCount).toBe(2);
      expect(result.speakers).toContain('Speaker 0');
      expect(result.summary).toBe('Test summary');
    });
  });

  describe('detectKeyEvents', () => {
    it('should detect appointment mentions', () => {
      const transcript = {
        fullText: 'I can come by tomorrow to see the property',
        speakerUtterances: [
          { speakerId: 1, text: 'I can come by tomorrow to see the property', start: 10 }
        ]
      };

      const events = service.detectKeyEvents(transcript);
      
      expect(events.some(e => e.type === 'appointment_mentioned')).toBe(true);
    });

    it('should detect DNC requests', () => {
      const transcript = {
        fullText: 'Please do not call me again',
        speakerUtterances: []
      };

      const events = service.detectKeyEvents(transcript);
      
      expect(events.some(e => e.type === 'dnc_requested')).toBe(true);
    });

    it('should detect complaints', () => {
      const transcript = {
        fullText: 'I want to file a complaint about these calls',
        speakerUtterances: []
      };

      const events = service.detectKeyEvents(transcript);
      
      expect(events.some(e => e.type === 'complaint_raised')).toBe(true);
    });
  });

  describe('determineCallOutcome', () => {
    it('should return appointment scheduled for appointment events', () => {
      const events = [{ type: 'appointment_mentioned' }];
      const transcript = { sentiment: { overall: 'positive' } };
      
      const outcome = service.determineCallOutcome(transcript, events);
      
      expect(outcome.status).toBe('Appointment Scheduled');
      expect(outcome.leadTemperature).toBe('Hot');
    });

    it('should return DNC for DNC events', () => {
      const events = [{ type: 'dnc_requested' }];
      const transcript = { sentiment: { overall: 'neutral' } };
      
      const outcome = service.determineCallOutcome(transcript, events);
      
      expect(outcome.status).toBe('DNC');
      expect(outcome.leadTemperature).toBe('Cold');
    });
  });

  describe('calculateCallQuality', () => {
    it('should give high score for appointments', () => {
      const transcript = { duration: 120 };
      const events = [{ type: 'appointment_mentioned' }];
      
      const quality = service.calculateCallQuality(transcript, events);
      
      expect(quality.score).toBeGreaterThan(60);
      expect(quality.rating).toBe('Good');
    });

    it('should give low score for complaints', () => {
      const transcript = { duration: 30 };
      const events = [{ type: 'complaint_raised' }];
      
      const quality = service.calculateCallQuality(transcript, events);
      
      expect(quality.score).toBeLessThan(40);
      expect(quality.rating).toBe('Poor');
    });
  });
});