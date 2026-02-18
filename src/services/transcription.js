/**
 * Deepgram Transcription Service
 * 
 * Handles audio transcription with speaker diarization and AI summarization
 */

const { createClient } = require('@deepgram/sdk');
const axios = require('axios');
const FormData = require('form-data');
const logger = require('../utils/logger');

class TranscriptionService {
  constructor() {
    this.apiKey = process.env.DEEPGRAM_API_KEY;
    this.deepgram = createClient(this.apiKey);
  }

  /**
   * Transcribe audio from buffer with speaker diarization
   * @param {Buffer} audioBuffer - Audio file buffer
   * @param {string} contentType - MIME type of audio (e.g., 'audio/mp3')
   * @returns {Promise<Object>} - Transcription results
   */
  async transcribeAudio(audioBuffer, contentType = 'audio/mp3') {
    try {
      logger.info('Starting transcription', {
        bufferSize: audioBuffer.length,
        contentType: contentType
      });

      const { result, error } = await this.deepgram.listen.prerecorded.transcribeFile(
        audioBuffer,
        {
          model: 'nova-2',
          smart_format: true,
          diarize: true, // Enable speaker diarization
          paragraphs: true,
          utterances: true,
          utt_split: 1.2, // Split utterances at 1.2 second pauses
          language: 'en-US',
          detect_language: false,
          summarize: 'v2', // Use Deepgram's summarization
          topics: true, // Detect topics
          intents: true, // Detect intents
          sentiment: true // Analyze sentiment
        }
      );

      if (error) {
        throw new Error(`Deepgram transcription error: ${error.message}`);
      }

      const transcript = this.formatTranscript(result);
      
      logger.info('Transcription completed', {
        duration: transcript.duration,
        wordCount: transcript.wordCount,
        speakers: transcript.speakers.length
      });

      return {
        success: true,
        transcript: transcript
      };

    } catch (error) {
      logger.error('Transcription failed', {
        error: error.message,
        stack: error.stack
      });

      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Transcribe audio from URL
   * @param {string} audioUrl - URL to audio file
   * @returns {Promise<Object>} - Transcription results
   */
  async transcribeFromUrl(audioUrl) {
    try {
      logger.info('Transcribing from URL', { url: audioUrl });

      const { result, error } = await this.deepgram.listen.prerecorded.transcribeUrl(
        {
          url: audioUrl
        },
        {
          model: 'nova-2',
          smart_format: true,
          diarize: true,
          paragraphs: true,
          utterances: true,
          utt_split: 1.2,
          language: 'en-US',
          summarize: 'v2',
          topics: true,
          intents: true,
          sentiment: true
        }
      );

      if (error) {
        throw new Error(`Deepgram transcription error: ${error.message}`);
      }

      const transcript = this.formatTranscript(result);

      return {
        success: true,
        transcript: transcript
      };

    } catch (error) {
      logger.error('Transcription from URL failed', {
        url: audioUrl,
        error: error.message
      });

      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Format Deepgram result into structured transcript
   * @param {Object} result - Deepgram API result
   * @returns {Object} - Formatted transcript
   */
  formatTranscript(result) {
    const results = result.results;
    const channels = results.channels || [];
    const channel = channels[0] || {};
    const alternatives = channel.alternatives || [];
    const alternative = alternatives[0] || {};
    
    // Get metadata
    const metadata = result.metadata || {};
    const duration = metadata.duration || 0;
    
    // Get full transcript text
    const fullText = alternative.transcript || '';
    const words = alternative.words || [];
    const paragraphs = alternative.paragraphs || [];
    const utterances = results.utterances || [];
    
    // Extract speakers from utterances
    const speakerUtterances = this.extractSpeakerUtterances(utterances);
    const speakers = [...new Set(utterances.map(u => u.speaker))];
    
    // Get summary if available
    const summary = results.summary?.short || results.summary?.result || '';
    
    // Get topics
    const topics = results.topics || [];
    
    // Get intents
    const intents = results.intents || [];
    
    // Get sentiment
    const sentiment = results.sentiment || {};
    const sentimentScore = this.calculateSentimentScore(sentiment);

    return {
      fullText: fullText,
      wordCount: words.length,
      duration: Math.round(duration),
      speakers: speakers.map(s => `Speaker ${s}`),
      speakerUtterances: speakerUtterances,
      paragraphs: paragraphs.map(p => p.text),
      summary: summary,
      topics: topics.map(t => ({
        topic: t.topic,
        confidence: t.confidence,
        text: t.text
      })),
      intents: intents.map(i => ({
        intent: i.intent,
        confidence: i.confidence
      })),
      sentiment: sentimentScore,
      confidence: alternative.confidence || 0,
      language: metadata.language || 'en-US'
    };
  }

  /**
   * Extract utterances by speaker
   * @param {Array} utterances - Deepgram utterances
   * @returns {Array} - Speaker-labeled utterances
   */
  extractSpeakerUtterances(utterances) {
    const speakerMap = {
      0: 'Agent (Alex)',
      1: 'Lead (Homeowner)'
    };

    return utterances.map(u => ({
      speaker: speakerMap[u.speaker] || `Speaker ${u.speaker}`,
      speakerId: u.speaker,
      text: u.transcript,
      start: u.start,
      end: u.end,
      confidence: u.confidence
    }));
  }

  /**
   * Calculate overall sentiment score
   * @param {Object} sentiment - Deepgram sentiment result
   * @returns {Object} - Formatted sentiment
   */
  calculateSentimentScore(sentiment) {
    if (!sentiment || !sentiment.segments) {
      return {
        overall: 'neutral',
        score: 0,
        positive: 0,
        negative: 0,
        neutral: 0
      };
    }

    const segments = sentiment.segments || [];
    const counts = { positive: 0, negative: 0, neutral: 0 };
    
    segments.forEach(seg => {
      const label = seg.sentiment?.toLowerCase() || 'neutral';
      counts[label]++;
    });

    const total = segments.length || 1;
    const positive = counts.positive / total;
    const negative = counts.negative / total;
    const neutral = counts.neutral / total;
    
    // Determine overall sentiment
    let overall = 'neutral';
    if (positive > negative && positive > neutral) overall = 'positive';
    else if (negative > positive && negative > neutral) overall = 'negative';

    // Calculate score (-1 to 1)
    const score = positive - negative;

    return {
      overall: overall,
      score: parseFloat(score.toFixed(2)),
      positive: parseFloat(positive.toFixed(2)),
      negative: parseFloat(negative.toFixed(2)),
      neutral: parseFloat(neutral.toFixed(2)),
      segments: segments.length
    };
  }

  /**
   * Generate AI summary of the call using Deepgram
   * @param {Object} transcript - Formatted transcript
   * @returns {Object} - Call summary
   */
  generateCallSummary(transcript) {
    const utterances = transcript.speakerUtterances || [];
    const leadUtterances = utterances.filter(u => u.speakerId === 1);
    const agentUtterances = utterances.filter(u => u.speakerId === 0);

    // Key metrics
    const leadTalkRatio = leadUtterances.length / (utterances.length || 1);
    const totalLeadWords = leadUtterances.reduce((sum, u) => 
      sum + (u.text ? u.text.split(' ').length : 0), 0
    );

    // Detect key events
    const keyEvents = this.detectKeyEvents(transcript);

    // Determine call outcome
    const outcome = this.determineCallOutcome(transcript, keyEvents);

    return {
      duration: transcript.duration,
      wordCount: transcript.wordCount,
      leadTalkRatio: parseFloat(leadTalkRatio.toFixed(2)),
      leadWordCount: totalLeadWords,
      agentWordCount: transcript.wordCount - totalLeadWords,
      summary: transcript.summary,
      sentiment: transcript.sentiment,
      keyEvents: keyEvents,
      outcome: outcome,
      topics: transcript.topics,
      confidence: transcript.confidence
    };
  }

  /**
   * Detect key events in the conversation
   * @param {Object} transcript - Formatted transcript
   * @returns {Array} - Key events detected
   */
  detectKeyEvents(transcript) {
    const events = [];
    const text = transcript.fullText.toLowerCase();
    const utterances = transcript.speakerUtterances || [];

    // Check for appointment scheduled
    const appointmentKeywords = [
      'see the property', 'come by', 'stop by', 'take a look', 
      'view the house', 'appointment', 'schedule', 'come over',
      'thursday', 'friday', 'monday', 'tuesday', 'wednesday',
      'saturday', 'sunday', 'tomorrow', 'next week'
    ];
    
    for (const keyword of appointmentKeywords) {
      if (text.includes(keyword)) {
        // Find the utterance containing this
        const matchUtterance = utterances.find(u => 
          u.text.toLowerCase().includes(keyword)
        );
        
        if (matchUtterance) {
          events.push({
            type: 'appointment_mentioned',
            confidence: 'medium',
            context: matchUtterance.text,
            timestamp: matchUtterance.start
          });
          break;
        }
      }
    }

    // Check for price discussion
    const priceKeywords = ['price', 'offer', 'how much', 'dollar', '$', 'thousand'];
    for (const keyword of priceKeywords) {
      if (text.includes(keyword)) {
        events.push({
          type: 'price_discussed',
          confidence: 'high',
          context: 'Price or offer was discussed'
        });
        break;
      }
    }

    // Check for DNC request
    const dncKeywords = ['do not call', 'stop calling', 'remove', 'don\'t call', 'unsubscribe'];
    for (const keyword of dncKeywords) {
      if (text.includes(keyword)) {
        events.push({
          type: 'dnc_requested',
          confidence: 'high',
          context: 'Lead requested to be added to do-not-call list'
        });
        break;
      }
    }

    // Check for complaint
    const complaintKeywords = ['complaint', 'angry', 'fraud', 'scam', 'attorney', 'lawyer', 'sue'];
    for (const keyword of complaintKeywords) {
      if (text.includes(keyword)) {
        events.push({
          type: 'complaint_raised',
          confidence: 'high',
          context: 'Lead expressed dissatisfaction or legal concern',
          alert_required: true
        });
        break;
      }
    }

    // Check for voicemail
    if (text.includes('leave a message') || text.includes('voicemail') || text.includes('not available')) {
      events.push({
        type: 'voicemail_left',
        confidence: 'high',
        context: 'Call went to voicemail'
      });
    }

    // Check for interested signals
    const interestKeywords = ['interested', 'yes', 'sounds good', 'tell me more', 'what next'];
    for (const keyword of interestKeywords) {
      if (text.includes(keyword)) {
        events.push({
          type: 'interest_expressed',
          confidence: 'medium',
          context: 'Lead expressed interest in proceeding'
        });
        break;
      }
    }

    return events;
  }

  /**
   * Determine the outcome of the call
   * @param {Object} transcript - Formatted transcript
   * @param {Array} keyEvents - Detected key events
   * @returns {Object} - Call outcome
   */
  determineCallOutcome(transcript, keyEvents) {
    const events = keyEvents || [];
    const sentiment = transcript.sentiment || {};
    
    // Check for specific outcomes
    const hasDNC = events.some(e => e.type === 'dnc_requested');
    const hasComplaint = events.some(e => e.type === 'complaint_raised');
    const hasAppointment = events.some(e => e.type === 'appointment_mentioned');
    const hasVoicemail = events.some(e => e.type === 'voicemail_left');
    const hasInterest = events.some(e => e.type === 'interest_expressed');

    // Determine lead temperature
    let leadTemperature = 'Warm';
    let status = 'Contacted';
    let nextAction = 'Follow up in 1 week';

    if (hasDNC) {
      status = 'DNC';
      leadTemperature = 'Cold';
      nextAction = 'Remove from call list';
    } else if (hasComplaint) {
      status = 'Complaint';
      leadTemperature = 'Cold';
      nextAction = 'Escalate to manager';
    } else if (hasAppointment) {
      status = 'Appointment Scheduled';
      leadTemperature = 'Hot';
      nextAction = 'Confirm appointment 24hrs before';
    } else if (hasVoicemail) {
      status = 'Voicemail Left';
      nextAction = 'Follow up in 3 days';
    } else if (hasInterest) {
      status = 'Interested';
      leadTemperature = 'Hot';
      nextAction = 'Call back within 24 hours';
    } else if (sentiment.overall === 'negative') {
      leadTemperature = 'Cold';
      nextAction = 'Follow up in 2 weeks';
    }

    return {
      status: status,
      leadTemperature: leadTemperature,
      nextAction: nextAction,
      sentiment: sentiment.overall,
      sentimentScore: sentiment.score,
      callQuality: this.calculateCallQuality(transcript, events)
    };
  }

  /**
   * Calculate call quality score
   * @param {Object} transcript - Formatted transcript
   * @param {Array} events - Key events
   * @returns {Object} - Quality metrics
   */
  calculateCallQuality(transcript, events) {
    let score = 50; // Base score
    const sentiment = transcript.sentiment || {};
    
    // Adjust based on sentiment
    if (sentiment.overall === 'positive') score += 20;
    else if (sentiment.overall === 'negative') score -= 20;
    
    // Adjust based on events
    const hasAppointment = events.some(e => e.type === 'appointment_mentioned');
    const hasInterest = events.some(e => e.type === 'interest_expressed');
    const hasDNC = events.some(e => e.type === 'dnc_requested');
    const hasComplaint = events.some(e => e.type === 'complaint_raised');
    
    if (hasAppointment) score += 30;
    if (hasInterest) score += 15;
    if (hasDNC) score -= 30;
    if (hasComplaint) score -= 50;
    
    // Check duration - too short might be hangup
    if (transcript.duration < 30) score -= 20;
    if (transcript.duration > 180) score += 10; // Good engagement
    
    // Cap score
    score = Math.max(0, Math.min(100, score));
    
    return {
      score: score,
      rating: score >= 80 ? 'Excellent' : score >= 60 ? 'Good' : score >= 40 ? 'Fair' : 'Poor'
    };
  }
}

module.exports = TranscriptionService;