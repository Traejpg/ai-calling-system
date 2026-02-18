# Quick Start Guide

## 5-Minute Setup

### 1. Install Dependencies
```bash
cd ai-calling-system
npm install
```

### 2. Configure Environment
```bash
cp .env.template .env
# Edit .env with your credentials
```

### 3. Setup Notion Database
```bash
node scripts/setup-notion.js
# Copy the database ID to your .env file
```

### 4. Test the Server
```bash
npm run dev
# In another terminal:
curl http://localhost:3000/health
```

### 5. Run a Test Call
```bash
curl -X POST http://localhost:3000/api/calls/trigger \
  -H "Content-Type: application/json" \
  -d '{"phone": "YOUR_PHONE_NUMBER"}'
```

## Daily Operations

### Start the server
```bash
npm start
# or with PM2:
pm2 start ecosystem.config.js
```

### Trigger calls manually
```bash
npm run call-trigger
```

### Check logs
```bash
tail -f logs/combined.log
```

## Troubleshooting

### Server won't start
- Check if port 3000 is available
- Verify all environment variables are set
- Check logs/error.log

### Calls not initiating
- Check Twilio account balance
- Verify business hours (9 AM - 6 PM CST)
- Check that leads have phone numbers

### Transcriptions not working
- Verify Deepgram API key
- Check that recordings exist in Twilio

## Need Help?

See the full README.md for detailed documentation.