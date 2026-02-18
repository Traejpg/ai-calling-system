# AI Calling System - Production Deployment Guide

## 🚀 Deploy to Render

### Method 1: Blueprint (Recommended - Infrastructure as Code)

1. **Push this repo to GitHub**
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin https://github.com/YOUR_USERNAME/ai-calling-system.git
   git push -u origin main
   ```

2. **Create New Blueprint on Render**
   - Go to https://dashboard.render.com/blueprints
   - Click "New Blueprint Instance"
   - Connect your GitHub repo
   - Render will read `render.yaml` and create the service

3. **Set Environment Variables**
   After the service is created, go to the service dashboard and add these env vars:
   
   | Variable | Description | Source |
   |----------|-------------|--------|
   | `TWILIO_ACCOUNT_SID` | Your Twilio Account SID | Twilio Console |
   | `TWILIO_AUTH_TOKEN` | Your Twilio Auth Token | Twilio Console |
   | `TWILIO_PHONE_NUMBER` | Your Twilio phone number | Twilio Console |
   | `ELEVENLABS_API_KEY` | ElevenLabs API key | ElevenLabs Settings |
   | `ELEVENLABS_AGENT_ID` | Your AI agent ID | ElevenLabs Conversational AI |
   | `ELEVENLABS_PHONE_NUMBER_ID` | Your ElevenLabs phone ID | ElevenLabs Phone Numbers |
   | `DEEPGRAM_API_KEY` | Deepgram API key | Deepgram Console |
   | `NOTION_TOKEN` | Notion integration token | Notion Integrations |
   | `NOTION_DATABASE_ID` | Leads database ID | Notion database URL |
   | `NOTION_CALLS_DB_ID` | Calls database ID | Notion database URL |
   | `SMS_ALERT_NUMBER` | Your phone for alerts | Your phone number |

### Method 2: Manual Web Service

1. Go to https://dashboard.render.com/
2. Click "New +" → "Web Service"
3. Connect your GitHub repo
4. Configure:
   - **Name**: `ai-calling-system`
   - **Runtime**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Plan**: Starter ($7/month) or Free
5. Add environment variables (same as above)
6. Click "Create Web Service"

---

## 🔗 Update ElevenLabs Webhook

After deployment, get your Render URL:

```
https://ai-calling-system-xxx.onrender.com
```

### Update ElevenLabs Agent:

1. Go to https://elevenlabs.io/app/conversational-ai
2. Select your agent
3. Go to **Settings** → **Webhook**
4. Set **Webhook URL** to:
   ```
   https://ai-calling-system-xxx.onrender.com/webhooks/twilio/status
   ```
5. Click **Save**

---

## ✅ Testing the Deployment

### 1. Health Check
```bash
curl https://ai-calling-system-xxx.onrender.com/health
```

Expected response:
```json
{
  "status": "healthy",
  "services": {
    "notion": true,
    "callsDb": true,
    "deepgram": true
  }
}
```

### 2. Test Call
- Make a test call through ElevenLabs
- Check Render logs: https://dashboard.render.com/web/services/ai-calling-system/logs
- Verify webhook received: Look for `Incoming POST request to /webhooks/twilio/status`
- Check Notion: New call record should appear in Calls database

### 3. Test Recording Transcription
- Complete a call with recording enabled
- Verify `/webhooks/twilio/recording` endpoint receives the callback
- Check that transcript appears in Notion call record

---

## 📝 Logs & Monitoring

### View Logs
- **Render Dashboard**: https://dashboard.render.com/web/services/ai-calling-system/logs
- **CLI** (if using Render CLI):
  ```bash
  render logs --service ai-calling-system
  ```

### Important Log Messages
| Message | Meaning |
|---------|---------|
| `✅ Twilio signature validated` | Webhook security check passed |
| `📝 Creating Notion call record` | Call being logged to Notion |
| `✅ Call record created` | Successfully saved to Notion |
| `🎯 Triggering Deepgram transcription` | Transcription starting |
| `✅ Transcript saved to Notion` | Full workflow complete |

---

## 🔄 Auto-Deploy

Render automatically deploys on every push to your main branch.

To disable:
1. Go to service settings
2. Turn off "Auto-Deploy"

---

## 💰 Cost Estimate

| Component | Cost |
|-----------|------|
| Render Starter Plan | $7/month |
| Twilio (per minute) | ~$0.013/min |
| Deepgram (per hour) | ~$0.75/hr |
| Notion API | Free |
| ElevenLabs | Per your plan |

---

## 🆘 Troubleshooting

### Webhook not receiving calls?
1. Check Render URL is correct in ElevenLabs
2. Verify `TWILIO_AUTH_TOKEN` is set correctly
3. Check Render logs for signature validation errors

### Notion not logging calls?
1. Verify `NOTION_TOKEN` has correct permissions
2. Check `NOTION_CALLS_DB_ID` is correct
3. Look for Notion API errors in logs

### Transcription not working?
1. Verify `DEEPGRAM_API_KEY` is set
2. Check `/health` endpoint shows `deepgram: true`
3. Look for transcription errors in logs

---

## 🔒 Security Notes

- All env vars marked with `sync: false` in `render.yaml` are encrypted
- Twilio webhook signatures are validated in production
- Never commit `.env` files to Git

---

## 📚 Additional Resources

- [Render Node.js Deploy Guide](https://render.com/docs/deploy-node-express-app)
- [Twilio Webhook Security](https://www.twilio.com/docs/usage/webhooks/webhooks-security)
- [ElevenLabs Conversational AI](https://elevenlabs.io/docs/conversational-ai)
