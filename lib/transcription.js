/**
 * Deepgram Transcription Service
 * 
 * Provides transcription of Twilio recordings using Deepgram's Nova-3 model
 * with speaker diarization and keyword boosting for real estate terminology.
 */

const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');

// Deepgram API configuration
const DEEPGRAM_API_URL = 'https://api.deepgram.com/v1/listen';
const DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY;

/**
 * Transcribes a Twilio recording using Deepgram's Nova-3 model
 * @param {string} recordingUrl - The Twilio recording URL to transcribe
 * @returns {Promise<Object>} Transcription result with transcript, confidence, and word timings
 */
async function transcribeRecording(recordingUrl) {
  if (!DEEPGRAM_API_KEY) {
    throw new Error('DEEPGRAM_API_KEY environment variable is required');
  }

  if (!recordingUrl) {
    throw new Error('recordingUrl is required');
  }

  let tempFilePath = null;

  try {
    // Step 1: Download audio from Twilio URL
    console.log(`[Transcription] Downloading audio from: ${recordingUrl}`);
    const audioBuffer = await downloadAudio(recordingUrl);

    // Step 2: Save to temporary file
    const tempFileName = `twilio-audio-${Date.now()}.wav`;
    tempFilePath = path.join(os.tmpdir(), tempFileName);
    await fs.writeFile(tempFilePath, audioBuffer);
    console.log(`[Transcription] Audio saved to temp file: ${tempFilePath}`);

    // Step 3: Send to Deepgram API
    console.log('[Transcription] Sending to Deepgram Nova-3...');
    const transcriptionResult = await sendToDeepgram(tempFilePath);

    // Step 4: Parse and return structured result
    const parsedResult = parseTranscriptionResult(transcriptionResult);
    console.log('[Transcription] Transcription complete');

    return parsedResult;

  } catch (error) {
    console.error('[Transcription] Error:', error.message);
    throw error;

  } finally {
    // Step 5: Cleanup temp file
    if (tempFilePath) {
      try {
        await fs.unlink(tempFilePath);
        console.log(`[Transcription] Temp file cleaned up: ${tempFilePath}`);
      } catch (cleanupError) {
        console.warn('[Transcription] Failed to cleanup temp file:', cleanupError.message);
      }
    }
  }
}

/**
 * Downloads audio from a URL (handles Twilio's .wav files)
 * @param {string} url - The audio URL to download
 * @returns {Promise<Buffer>} Audio file buffer
 */
async function downloadAudio(url) {
  try {
    const response = await axios({
      method: 'GET',
      url: url,
      responseType: 'arraybuffer',
      timeout: 30000, // 30 second timeout
      headers: {
        'Accept': 'audio/wav,audio/*'
      }
    });

    return Buffer.from(response.data);
  } catch (error) {
    if (error.code === 'ECONNABORTED') {
      throw new Error('Audio download timed out');
    }
    if (error.response) {
      throw new Error(`Failed to download audio: ${error.response.status} ${error.response.statusText}`);
    }
    throw new Error(`Failed to download audio: ${error.message}`);
  }
}

/**
 * Sends audio to Deepgram API for transcription
 * @param {string} audioFilePath - Path to the audio file
 * @returns {Promise<Object>} Deepgram API response
 */
async function sendToDeepgram(audioFilePath) {
  // Read the audio file
  const audioBuffer = await fs.readFile(audioFilePath);

  // Build query parameters for Nova-3 with diarization and keyword boosting
  const params = new URLSearchParams({
    model: 'nova-3',
    diarize: 'true',
    punctuate: 'true',
    utterances: 'true',
    keywords: 'real estate:2,offer:2,price:2,house:2,sell:2,timeline:2'
  });

  try {
    const response = await axios({
      method: 'POST',
      url: `${DEEPGRAM_API_URL}?${params.toString()}`,
      data: audioBuffer,
      headers: {
        'Authorization': `Token ${DEEPGRAM_API_KEY}`,
        'Content-Type': 'audio/wav'
      },
      timeout: 60000 // 60 second timeout for transcription
    });

    return response.data;
  } catch (error) {
    if (error.code === 'ECONNABORTED') {
      throw new Error('Deepgram API request timed out');
    }
    if (error.response) {
      const errorData = error.response.data;
      throw new Error(
        `Deepgram API error: ${error.response.status} - ${
          errorData?.message || errorData?.err_msg || error.response.statusText
        }`
      );
    }
    throw new Error(`Deepgram API request failed: ${error.message}`);
  }
}

/**
 * Parses Deepgram response into structured format
 * @param {Object} deepgramResult - Raw Deepgram API response
 * @returns {Object} Structured transcription result
 */
function parseTranscriptionResult(deepgramResult) {
  if (!deepgramResult.results || !deepgramResult.results.channels || !deepgramResult.results.channels[0]) {
    throw new Error('Invalid Deepgram response format');
  }

  const channel = deepgramResult.results.channels[0];
  const alternatives = channel.alternatives;

  if (!alternatives || alternatives.length === 0) {
    throw new Error('No transcription alternatives found');
  }

  const bestAlternative = alternatives[0];

  // Calculate overall confidence
  const confidence = bestAlternative.confidence || 0;

  // Extract full transcript
  const transcript = bestAlternative.transcript || '';

  // Extract word timings with speaker info
  const words = bestAlternative.words || [];
  const wordTimings = words.map(word => ({
    word: word.word,
    start: word.start,
    end: word.end,
    confidence: word.confidence,
    speaker: word.speaker !== undefined ? word.speaker : null,
    punctuated_word: word.punctuated_word || word.word
  }));

  // Extract utterances (speaker-separated segments)
  const utterances = deepgramResult.results.utterances || [];
  const segments = utterances.map(utterance => ({
    speaker: utterance.speaker,
    transcript: utterance.transcript,
    start: utterance.start,
    end: utterance.end,
    confidence: utterance.confidence
  }));

  return {
    transcript,
    confidence,
    wordTimings,
    segments,
    metadata: {
      duration: deepgramResult.metadata?.duration || null,
      channels: deepgramResult.metadata?.channels || 1,
      model: deepgramResult.metadata?.model || 'nova-3',
      processedAt: new Date().toISOString()
    }
  };
}

/**
 * Validates that Deepgram API key is configured
 * @returns {boolean} True if API key is set
 */
function isConfigured() {
  return !!DEEPGRAM_API_KEY;
}

module.exports = {
  transcribeRecording,
  isConfigured
};
