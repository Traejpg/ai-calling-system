# AI Calling System

An automated AI calling system that integrates with Twilio for voice calls, OpenAI for transcription and AI responses, Notion for data storage, and Twilio SMS for alerts.

## Features

- 🤖 **AI-Powered Voice Calls** - Automated outbound calls with AI voice interaction
- 📝 **Call Transcription** - Automatic transcription using OpenAI Whisper
- 📊 **Notion Integration** - Store call data, transcripts, and outcomes in Notion
- 📱 **SMS Alerts** - Send notifications via Twilio SMS
- 🔊 **Text-to-Speech** - ElevenLabs integration for natural-sounding AI voice
- 🎯 **Webhook Support** - Real-time call status and recording callbacks

## Table of Contents

- [Prerequisites](#prerequisites)
- [Environment Variables](#environment-variables)
- [Local Setup](#local-setup)
- [Running Locally](#running-locally)
- [Deployment](#deployment)
- [Testing Checklist](#testing-checklist)
- [API Documentation](#api-documentation)
- [Troubleshooting](#troubleshooting)

## Prerequisites

Before you begin, ensure you have:

- **Node.js** v18+ installed
- **npm** or **yarn** package manager
- **Twilio account** with:
  - Account SID
  - Auth Token
  - Phone number with voice capabilities
- **OpenAI API key** for transcription and AI responses
- **Notion integration** with:
  - Integration token
  - Database ID for storing call data
- **ElevenLabs API key** for text-to-speech (optional, falls back to Twilio TTS)

## Environment Variables

Create a `.env` file in the root directory. See `.env.example` for the template.

### Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `NODE_ENV` | Environment mode | `development` or `production` |
| `PORT` | Server port | `3000` |
| `TWILIO_ACCOUNT_SID` | Twilio Account SID | `ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxx` |
| `TWILIO_AUTH_TOKEN` | Twilio Auth Token | `xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx` |
| `TWILIO_PHONE_NUMBER` | Your Twilio phone number | `+1234567890` |
| `OPENAI_API_KEY` | OpenAI API key | `sk-xxxxxxxxxxxxxxxxxxxxxxxxxx` |
| `NOTION_TOKEN` | Notion integration token | `secret_xxxxxxxxxxxxxxxxxxxxxxx` |
| `NOTION_DATABASE_ID` | Notion database ID | `xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx` |

### Optional Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `ELEVENLABS_API_KEY` | ElevenLabs API key for TTS | - |
| `ELEVENLABS_VOICE_ID` | ElevenLabs voice ID | `pMsXgVXv3BLzUgSXRplE` |
| `WEBHOOK_URL` | Public URL for webhooks | `http://localhost:3000` |
| `LOG_LEVEL` | Logging level | `info` |
| `SMS_ALERT_NUMBER` | Default SMS alert recipient | - |

## Local Setup

### 1. Clone the Repository

```bash
git clone <repository-url>
cd ai-calling-system
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment Variables

```bash
cp .env.example .env
# Edit .env with your credentials
nano .env
```

### 4. Set Up Ngrok (for local webhook testing)

Webhooks require a public URL. For local development:

```bash
# Install ngrok globally
npm install -g ngrok

# Start ngrok on your local port
ngrok http 3000
```

Copy the HTTPS URL (e.g., `https://abc123.ngrok.io`) and update your `WEBHOOK_URL` in `.env`.

### 5. Configure Twilio Webhooks

In your Twilio Console:
1. Go to Phone Numbers → Manage → Active Numbers
2. Click on your number
3. Set "A Call Comes In" webhook to: `https://your-ngrok-url/webhooks/incoming-call`
4. Set HTTP method to POST
5. Set "Call Status Changes" webhook to: `https://your-ngrok-url/webhooks/call-status`

## Running Locally

### Development Mode (with hot reload)

```bash
# Using the provided script
./dev.sh

# Or manually
npm run dev
```

### Production Mode (locally)

```bash
# Using the provided script
./start.sh

# Or manually
npm start
```

### Verify Server is Running

```bash
curl http://localhost:3000/health
# Expected: {"status":"ok","timestamp":"2024-01-01T00:00:00.000Z"}
```

## Deployment

### Option 1: PM2 (Recommended)

PM2 is a production process manager for Node.js applications.

```bash
# Install PM2 globally
npm install -g pm2

# Start with ecosystem file
pm2 start ecosystem.config.js

# View logs
pm2 logs ai-calling-system

# Monitor
pm2 monit

# Restart
pm2 restart ai-calling-system

# Stop
pm2 stop ai-calling-system
```

PM2 will automatically restart on crashes and persist across server reboots.

### Option 2: Systemd Service

For Linux servers with systemd:

```bash
# Copy service file
sudo cp systemd/ai-calling-system.service /etc/systemd/system/

# Edit service file with your paths
sudo nano /etc/systemd/system/ai-calling-system.service

# Reload systemd
sudo systemctl daemon-reload

# Enable service (start on boot)
sudo systemctl enable ai-calling-system

# Start service
sudo systemctl start ai-calling-system

# Check status
sudo systemctl status ai-calling-system

# View logs
sudo journalctl -u ai-calling-system -f
```

### Option 3: Docker

```bash
# Build image
docker build -t ai-calling-system .

# Run container
docker run -d \
  --name ai-calling-system \
  --env-file .env \
  -p 3000:3000 \
  ai-calling-system

# View logs
docker logs -f ai-calling-system

# Stop
docker stop ai-calling-system
```

### Option 4: Docker Compose

```bash
# Start services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop
docker-compose down
```

### Deploying to a Server

#### VPS/Cloud Server (Ubuntu/Debian)

1. **Prepare the server:**
```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 18+
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Install PM2
sudo npm install -g pm2
```

2. **Deploy application:**
```bash
# Clone repository
git clone <repository-url>
cd ai-calling-system

# Install dependencies
npm install --production

# Copy environment file
cp .env.example .env
nano .env  # Add your production credentials

# Start with PM2
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

3. **Set up Nginx (optional, for SSL):**
```bash
sudo apt install nginx certbot python3-certbot-nginx

# Configure Nginx (see nginx.conf example)
sudo nano /etc/nginx/sites-available/ai-calling-system

# Enable site
sudo ln -s /etc/nginx/sites-available/ai-calling-system /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx

# Get SSL certificate
sudo certbot --nginx -d your-domain.com
```

## Testing Checklist

Use this checklist to verify all system components are working:

### Basic Functionality

- [ ] **Server starts** without errors
  ```bash
  npm start
  # Check for "Server running on port 3000" message
  ```

- [ ] **Health endpoint responds**
  ```bash
  curl http://localhost:3000/health
  # Expected: {"status":"ok"...}
  ```

### Webhook Endpoints

- [ ] **Webhook endpoints respond**
  ```bash
  # Test incoming call webhook
  curl -X POST http://localhost:3000/webhooks/incoming-call \
    -d "CallSid=test123&From=%2B1234567890"
  
  # Expected: TwiML XML response
  ```

- [ ] **Call status webhook works**
  ```bash
  curl -X POST http://localhost:3000/webhooks/call-status \
    -d "CallSid=test123&CallStatus=completed"
  
  # Expected: 200 OK
  ```

### Call Flow

- [ ] **Test call initiates**
  ```bash
  curl -X POST http://localhost:3000/api/calls \
    -H "Content-Type: application/json" \
    -d '{"to":"+1234567890","message":"Hello, this is a test call"}'
  
  # Expected: {"callSid":"CAxxx",...}
  ```

- [ ] **Recording transcribes** (after call completes)
  - Make a test call
  - Leave a voicemail or speak during the call
  - Check logs for transcription output
  - Verify transcript is saved to Notion

### Integrations

- [ ] **Notion updates** with call data
  - Check your Notion database after a test call
  - Verify entry contains: Call SID, From/To numbers, Duration, Status, Transcript

- [ ] **SMS alerts send**
  ```bash
  curl -X POST http://localhost:3000/api/sms \
    -H "Content-Type: application/json" \
    -d '{"to":"+1234567890","message":"Test alert"}'
  
  # Expected: {"messageSid":"SMxxx",...}
  # Verify SMS is received on target phone
  ```

### End-to-End Test

- [ ] **Complete call flow works**
  1. Initiate outbound call
  2. Answer the call
  3. Interact with AI voice
  4. End the call
  5. Verify transcript in Notion
  6. Verify SMS alert received (if configured)

## API Documentation

### Endpoints

#### Health Check
```
GET /health
Response: {"status":"ok","timestamp":"..."}
```

#### Initiate Call
```
POST /api/calls
Content-Type: application/json
Body: {
  "to": "+1234567890",
  "message": "Hello from AI",
  "record": true
}
Response: {"callSid":"CAxxx","status":"queued"}
```

#### Send SMS
```
POST /api/sms
Content-Type: application/json
Body: {
  "to": "+1234567890",
  "message": "Alert message"
}
Response: {"messageSid":"SMxxx","status":"queued"}
```

#### Webhooks
```
POST /webhooks/incoming-call
# Twilio incoming call webhook

POST /webhooks/call-status
# Twilio call status callback

POST /webhooks/recording
# Twilio recording callback
```

## Troubleshooting

### Common Issues

#### Server won't start
- Check if port is already in use: `lsof -i :3000`
- Verify all environment variables are set
- Check Node.js version: `node --version` (need v18+)

#### Webhooks not receiving callbacks
- Verify `WEBHOOK_URL` is publicly accessible
- Check Twilio webhook URLs are correct in console
- Ensure ngrok is running (for local dev)
- Check firewall settings on server

#### Calls not connecting
- Verify Twilio phone number has voice capabilities
- Check Twilio account has sufficient balance
- Verify `TWILIO_PHONE_NUMBER` format includes country code

#### Transcription not working
- Verify `OPENAI_API_KEY` is valid
- Check OpenAI API rate limits
- Ensure recording URL is accessible to OpenAI

#### Notion not updating
- Verify `NOTION_TOKEN` has database access
- Check `NOTION_DATABASE_ID` is correct
- Ensure database has required properties

### Getting Help

1. Check application logs:
   ```bash
   # PM2
   pm2 logs ai-calling-system
   
   # Systemd
   sudo journalctl -u ai-calling-system -f
   
   # Docker
   docker logs ai-calling-system
   ```

2. Enable debug logging:
   ```bash
   LOG_LEVEL=debug npm start
   ```

3. Check Twilio logs in Twilio Console → Monitor → Logs

## License

MIT License - see LICENSE file for details

## Support

For issues and feature requests, please open an issue on GitHub.
