/**
 * Voicemail Drop Module
 * 
 * Generates and manages voicemail audio files
 * Supports both TTS-generated and pre-recorded voicemails
 */

const fs = require('fs');
const path = require('path');
const logger = require('../src/utils/logger');

// Voicemail configuration
const VOICEMAIL_CONFIG = {
  // Maximum voicemail length in seconds
  maxLength: 30,
  
  // Default callback number
  defaultCallbackNumber: process.env.CALLBACK_NUMBER || '773-985-2082',
  
  // Default sender name
  defaultSenderName: 'Alexis',
  
  // Default company name
  defaultCompanyName: 'Trae Castile',
  
  // Audio files directory
  audioDir: process.env.VOICEMAIL_AUDIO_DIR || path.join(process.cwd(), 'audio', 'voicemails')
};

/**
 * Ensure voicemail audio directory exists
 */
function ensureAudioDirectory() {
  if (!fs.existsSync(VOICEMAIL_CONFIG.audioDir)) {
    fs.mkdirSync(VOICEMAIL_CONFIG.audioDir, { recursive: true });
    logger.info(`Created voicemail audio directory: ${VOICEMAIL_CONFIG.audioDir}`);
  }
}

/**
 * Generate voicemail message text
 * @param {Object} options - Voicemail options
 * @param {string} options.leadName - Name of the lead
 * @param {string} options.propertyAddress - Property address
 * @param {string} options.callbackNumber - Callback phone number
 * @param {string} options.senderName - Name of the sender
 * @param {string} options.companyName - Company name
 * @returns {string} - Formatted voicemail message
 */
function generateVoicemailText(options = {}) {
  const {
    leadName = 'there',
    propertyAddress = 'your property',
    callbackNumber = VOICEMAIL_CONFIG.defaultCallbackNumber,
    senderName = VOICEMAIL_CONFIG.defaultSenderName,
    companyName = VOICEMAIL_CONFIG.defaultCompanyName
  } = options;

  // Format phone number for speaking (e.g., 773-985-2082)
  const formattedPhone = callbackNumber.replace(/(\d{3})(\d{3})(\d{4})/, '$1-$2-$3');

  // Generate message - keep under 30 seconds when spoken
  const message = `Hi ${leadName}, this is ${senderName} with ${companyName}. I'm calling about your property at ${propertyAddress}. Please call me back at ${formattedPhone} to discuss a potential offer. Thanks!`;

  return message;
}

/**
 * Generate voicemail TwiML
 * @param {Object} options - Voicemail options
 * @returns {string} - TwiML response
 */
function generateVoicemailTwiml(options = {}) {
  const message = options.customMessage || generateVoicemailText(options);
  
  // Use Amazon Polly voice for natural-sounding voicemail
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Pause length="2"/>
  <Say voice="Polly.Joanna">${escapeXml(message)}</Say>
  <Hangup/>
</Response>`;

  return twiml;
}

/**
 * Escape XML special characters
 * @param {string} str - String to escape
 * @returns {string} - Escaped string
 */
function escapeXml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Get voicemail audio URL (for pre-recorded audio files)
 * @param {string} filename - Audio filename
 * @returns {string|null} - Full URL to audio file or null
 */
function getVoicemailAudioUrl(filename = 'default-voicemail.mp3') {
  const audioPath = path.join(VOICEMAIL_CONFIG.audioDir, filename);
  
  if (!fs.existsSync(audioPath)) {
    logger.warn(`Voicemail audio file not found: ${audioPath}`);
    return null;
  }

  // Return public URL (requires static file serving to be configured)
  const baseUrl = process.env.WEBHOOK_BASE_URL || '';
  return `${baseUrl}/audio/voicemails/${filename}`;
}

/**
 * List available voicemail audio files
 * @returns {Array} - Array of available voicemail files
 */
function listVoicemailAudioFiles() {
  ensureAudioDirectory();
  
  try {
    const files = fs.readdirSync(VOICEMAIL_CONFIG.audioDir);
    return files
      .filter(f => f.endsWith('.mp3') || f.endsWith('.wav'))
      .map(f => ({
        filename: f,
        path: path.join(VOICEMAIL_CONFIG.audioDir, f),
        url: getVoicemailAudioUrl(f)
      }));
  } catch (error) {
    logger.error('Error listing voicemail files', { error: error.message });
    return [];
  }
}

/**
 * Generate TwiML for playing pre-recorded voicemail audio
 * @param {string} audioUrl - URL to audio file
 * @returns {string} - TwiML response
 */
function generateAudioVoicemailTwiml(audioUrl) {
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Pause length="2"/>
  <Play>${audioUrl}</Play>
  <Hangup/>
</Response>`;

  return twiml;
}

/**
 * Get voicemail configuration
 * @returns {Object} - Current voicemail configuration
 */
function getVoicemailConfig() {
  return {
    ...VOICEMAIL_CONFIG,
    audioFiles: listVoicemailAudioFiles()
  };
}

module.exports = {
  generateVoicemailText,
  generateVoicemailTwiml,
  generateAudioVoicemailTwiml,
  getVoicemailAudioUrl,
  listVoicemailAudioFiles,
  getVoicemailConfig,
  ensureAudioDirectory,
  VOICEMAIL_CONFIG
};