/**
 * Test script for Deepgram Transcription Service
 * 
 * Usage:
 *   DEEPGRAM_API_KEY=your_key node test-transcription.js <recording-url>
 * 
 * Or with .env file:
 *   node test-transcription.js <recording-url>
 */

require('dotenv').config();

const { transcribeRecording, isConfigured } = require('./lib/transcription');

// Get recording URL from command line arguments
const recordingUrl = process.argv[2];

async function runTest() {
  console.log('========================================');
  console.log('Deepgram Transcription Service Test');
  console.log('========================================\n');

  // Validate configuration
  if (!isConfigured()) {
    console.error('❌ ERROR: DEEPGRAM_API_KEY environment variable is not set');
    console.error('\nPlease set your Deepgram API key:');
    console.error('  export DEEPGRAM_API_KEY=your_api_key_here');
    console.error('\nOr create a .env file with:');
    console.error('  DEEPGRAM_API_KEY=your_api_key_here');
    process.exit(1);
  }

  console.log('✓ Deepgram API key is configured');

  // Validate recording URL
  if (!recordingUrl) {
    console.error('❌ ERROR: Recording URL is required');
    console.error('\nUsage:');
    console.error('  node test-transcription.js <recording-url>');
    console.error('\nExample:');
    console.error('  node test-transcription.js https://api.twilio.com/2010-04-01/Accounts/xxx/Recordings/RExxx.wav');
    process.exit(1);
  }

  console.log(`✓ Recording URL: ${recordingUrl}\n`);
  console.log('Starting transcription...\n');

  try {
    const startTime = Date.now();

    // Call the transcription service
    const result = await transcribeRecording(recordingUrl);

    const duration = Date.now() - startTime;

    // Display results
    console.log('\n========================================');
    console.log('TRANSCRIPTION RESULTS');
    console.log('========================================\n');

    console.log('📊 Metadata:');
    console.log(`  Duration: ${result.metadata.duration?.toFixed(2) || 'N/A'} seconds`);
    console.log(`  Channels: ${result.metadata.channels}`);
    console.log(`  Model: ${result.metadata.model}`);
    console.log(`  Processed At: ${result.metadata.processedAt}`);
    console.log(`  Processing Time: ${(duration / 1000).toFixed(2)} seconds\n`);

    console.log('🎯 Confidence Score:');
    console.log(`  ${(result.confidence * 100).toFixed(2)}%\n`);

    console.log('📝 Full Transcript:');
    console.log('----------------------------------------');
    console.log(result.transcript || '(No transcript)');
    console.log('----------------------------------------\n');

    console.log('👥 Speaker Segments:');
    if (result.segments && result.segments.length > 0) {
      result.segments.forEach((segment, index) => {
        console.log(`\n  [Segment ${index + 1}] Speaker ${segment.speaker}`);
        console.log(`  Time: ${segment.start.toFixed(2)}s - ${segment.end.toFixed(2)}s`);
        console.log(`  Confidence: ${(segment.confidence * 100).toFixed(2)}%`);
        console.log(`  Text: "${segment.transcript}"`);
      });
    } else {
      console.log('  No speaker segments found');
    }

    console.log('\n\n📋 Word Timings (first 20 words):');
    if (result.wordTimings && result.wordTimings.length > 0) {
      console.log('  Word | Start | End | Speaker | Confidence');
      console.log('  ' + '-'.repeat(50));
      result.wordTimings.slice(0, 20).forEach(word => {
        const speaker = word.speaker !== null ? word.speaker : '-';
        console.log(
          `  ${word.punctuated_word.padEnd(12)} ${word.start.toFixed(2).padStart(6)}s ${word.end.toFixed(2).padStart(6)}s ${speaker.toString().padStart(7)} ${(word.confidence * 100).toFixed(1).padStart(6)}%`
        );
      });
      if (result.wordTimings.length > 20) {
        console.log(`  ... and ${result.wordTimings.length - 20} more words`);
      }
    } else {
      console.log('  No word timings available');
    }

    console.log('\n========================================');
    console.log('✅ Test completed successfully!');
    console.log('========================================\n');

    // Return result for programmatic use
    return result;

  } catch (error) {
    console.error('\n========================================');
    console.error('❌ TEST FAILED');
    console.error('========================================');
    console.error(`Error: ${error.message}\n`);

    if (error.message.includes('ECONNREFUSED') || error.message.includes('ENOTFOUND')) {
      console.error('💡 Hint: Check your internet connection');
    } else if (error.message.includes('401') || error.message.includes('Unauthorized')) {
      console.error('💡 Hint: Your Deepgram API key may be invalid or expired');
    } else if (error.message.includes('413')) {
      console.error('💡 Hint: The audio file is too large');
    } else if (error.message.includes('415')) {
      console.error('💡 Hint: The audio format is not supported');
    }

    process.exit(1);
  }
}

// Run the test
runTest();
