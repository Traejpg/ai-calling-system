# Voicemail Detection & Bad Number Retry System

## Overview

This document describes the voicemail detection and bad number retry logic implemented for the AI calling system.

## Features

### 1. Voicemail Detection & Drop

- **Detection Methods:**
  - Twilio AMD (Answering Machine Detection) - `DetectMessageEnd` mode
  - ElevenLabs post-call webhook voicemail indicators
  - Supports `machine_start`, `machine_end_beep`, `machine_end_silence`, `machine_end_other`

- **Voicemail Message:**
  - Duration: ~30 seconds
  - Content: "Hi {name}, this is Alexis with Trae Castile. I'm calling about your property at {address}. Please call me back at 773-985-2082 to discuss a potential offer. Thanks!"
  - Voice: Amazon Polly "Joanna" (natural-sounding)

- **Logging:**
  - Call record created with status "Voicemail Left"
  - Notes include the message that was left
  - Linked to lead record in Notion

### 2. Bad Number Retry Logic

- **Retry Configuration:**
  - Max retries: 2
  - Delay between retries: 15 minutes
  - After max retries: Marked as "Bad Number"

- **Failure Types Tracked:**
  - `no-answer` - No one answered the call
  - `busy` - Line was busy
  - `failed` - General call failure
  - `disconnected` - Number disconnected (bad number candidate)
  - `invalid` - Invalid number format (bad number candidate)

- **Bad Number Storage:**
  - Stored in `data/bad-numbers.json`
  - Normalized format (10 digits, no country code)
  - Includes metadata: reason, timestamp, leadId

- **Database Logging:**
  - Call records logged to Notion with status "Bad Number"
  - Lead status updated to "Bad Number"
  - Notes include failure reason

## API Endpoints

### Webhooks

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/webhooks/twilio/status` | POST | Call status updates with AMD support |
| `/webhooks/twilio/recording` | POST | Recording available events |
| `/webhooks/elevenlabs/post-call` | POST | ElevenLabs post-call webhooks |

### TwiML

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/twiml/voice` | GET | Connect to ElevenLabs AI agent |
| `/twiml/voicemail` | GET | Voicemail message TwiML |
| `/twiml/amd-callback` | POST | AMD result callback handler |

### API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/calls/initiate-with-amd` | POST | Initiate call with AMD enabled |
| `/api/retry-queue/stats` | GET | Get retry queue statistics |
| `/api/bad-numbers` | GET | List all bad numbers |
| `/api/bad-numbers/clear` | POST | Clear a number from bad list (admin) |

## Usage Examples

### Initiate Call with AMD

```bash
curl -X POST http://localhost:3000/api/calls/initiate-with-amd \
  -H "Content-Type: application/json" \
  -d '{
    "phone_number": "+17739852082",
    "lead_id": "notion-lead-id",
    "lead_name": "John Doe",
    "property_address": "123 Main St"
  }'
```

### Check Retry Queue Stats

```bash
curl http://localhost:3000/api/retry-queue/stats
```

Response:
```json
{
  "total": 5,
  "pending": 3,
  "completed": 1,
  "permanentlyFailed": 1,
  "readyForRetry": 2,
  "badNumbersCount": 10
}
```

### List Bad Numbers

```bash
curl http://localhost:3000/api/bad-numbers
```

Response:
```json
{
  "count": 10,
  "badNumbers": [
    { "phoneNumber": "7735551234", "formatted": "+17735551234" }
  ],
  "stats": { ... }
}
```

## File Structure

```
ai-calling-system/
├── lib/
│   ├── webhookHandlers.js    # Main webhook processing with VM/bad number logic
│   ├── retryQueue.js         # Retry queue with bad number tracking
│   └── voicemailDrop.js      # Voicemail message generation
├── src/services/
│   └── twilio.js            # Twilio service with AMD support
├── data/
│   ├── retry-queue.json      # Pending retry queue
│   └── bad-numbers.json      # Bad numbers database
└── server.js                # Express server with endpoints
```

## Environment Variables

```env
# Required
TWILIO_ACCOUNT_SID=your_account_sid
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_PHONE_NUMBER=+1234567890
ELEVENLABS_AGENT_ID=your_agent_id
WEBHOOK_BASE_URL=https://your-server.com

# Optional
CALLBACK_NUMBER=773-985-2082
ADMIN_KEY=secret_admin_key
RETRY_QUEUE_PATH=./data/retry-queue.json
BAD_NUMBERS_PATH=./data/bad-numbers.json
VOICEMAIL_AUDIO_DIR=./audio/voicemails
```

## How It Works

### Voicemail Flow

1. Call initiated with AMD enabled (`machineDetection: 'DetectMessageEnd'`)
2. Twilio detects answering machine
3. AMD callback receives `AnsweredBy=machine_end_beep`
4. System redirects to `/twiml/voicemail`
5. TwiML plays voicemail message
6. Call record created with status "Voicemail Left"
7. System hangs up

### Bad Number Flow

1. Call fails (no-answer, busy, failed, disconnected)
2. Webhook handler categorizes failure type
3. If retry count < 2:
   - Add to retry queue with 15-min delay
   - Create call record with failure status
4. If retry count >= 2:
   - Mark number as bad in `bad-numbers.json`
   - Update Notion lead status to "Bad Number"
   - Create call record with "Bad Number" status
   - Send SMS alert
5. Retry processor runs every 15 minutes
6. Bad numbers are skipped on future attempts

## Error Codes

| Code | Description | Category |
|------|-------------|----------|
| 13214 | Number does not exist | disconnected |
| 21210 | Phone number not valid | invalid |
| 21211 | Invalid 'To' Phone Number | invalid |
| 13217 | Carrier congestion | busy |
| 13215 | No answer | no-answer |
| 13221 | Busy signal | busy |

## Monitoring

The system provides several monitoring endpoints:

- `GET /health` - Overall system health including queue stats
- `GET /api/retry-queue/stats` - Detailed retry queue statistics
- `GET /api/bad-numbers` - Bad numbers list

Logs are written with structured logging including:
- Call SID
- Phone number
- Retry count
- Failure reason
- Notion page IDs

## Testing

### Test Voicemail Detection

```bash
# Trigger AMD callback manually
curl -X POST http://localhost:3000/twiml/amd-callback \
  -d "CallSid=test123" \
  -d "AnsweredBy=machine_end_beep" \
  -d "To=+17735551234"
```

### Test Retry Logic

```bash
# Simulate a failed call
# This will add to retry queue
# Then wait 15 minutes or manually edit retry-queue.json retryAt time
```

## Notes

- AMD requires Twilio account with AMD feature enabled
- Voicemail messages use TTS (Amazon Polly) for flexibility
- Bad numbers are persisted across server restarts
- Retry queue processor runs every 15 minutes automatically
- All call activities are logged to Notion for tracking