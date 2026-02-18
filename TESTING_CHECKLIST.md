# AI Calling System - Testing Checklist

## Pre-Deployment Testing

### Environment Setup
- [ ] All environment variables configured in `.env`
- [ ] Node.js 18+ installed
- [ ] Dependencies installed (`npm install`)
- [ ] Logs directory created
- [ ] Data directory created

### API Credentials Validation
- [ ] Twilio credentials verified (Account SID, Auth Token, Phone Number)
- [ ] ElevenLabs API key verified
- [ ] Deepgram API key verified
- [ ] Notion integration token verified
- [ ] Notion databases shared with integration

### Unit Tests
```bash
npm test
```
- [ ] All tests pass
- [ ] No warnings or errors

## Server Testing

### Startup
```bash
npm run dev
```
- [ ] Server starts without errors
- [ ] Port 3000 is available
- [ ] Health check endpoint responds

### Health Check
```bash
curl http://localhost:3000/health
```
- [ ] Returns status: "ok"
- [ ] Shows all services configured: true

## Notion Integration Testing

### Database Setup
```bash
node scripts/setup-notion.js
```
- [ ] Call Records database created
- [ ] Database ID returned and added to .env
- [ ] All properties created correctly

### Lead Querying
```bash
curl http://localhost:3000/api/leads/ready
```
- [ ] Returns lead list
- [ ] Only Hot leads (80+ score) returned
- [ ] No DNC leads in results
- [ ] Leads sorted by score descending

## Twilio Integration Testing

### Webhook Configuration
- [ ] Voice webhook URL configured in Twilio
- [ ] Status callback URL configured
- [ ] Recording callback URL configured

### Test Call
```bash
curl -X POST http://localhost:3000/api/calls/trigger \
  -H "Content-Type: application/json" \
  -d '{"phone": "YOUR_PHONE_NUMBER", "leadId": "test-lead"}'
```
- [ ] Call initiated successfully
- [ ] Call SID returned
- [ ] Phone rings

### TwiML Response
- [ ] Voice webhook returns valid TwiML
- [ ] Contains Connect and Stream elements
- [ ] References ElevenLabs agent

## ElevenLabs Integration Testing

### Agent Configuration
- [ ] Agent "Alex" created in ElevenLabs
- [ ] System prompt configured
- [ ] Voice settings applied
- [ ] WebSocket streaming enabled

### Conversation Flow
- [ ] AI answers call with greeting
- [ ] AI responds to questions
- [ ] AI attempts to schedule appointment
- [ ] AI handles objections appropriately

## Recording & Transcription Testing

### Recording
- [ ] Call recorded in Twilio
- [ ] Recording URL generated
- [ ] Recording webhook triggered

### Transcription
- [ ] Audio downloaded from Twilio
- [ ] Deepgram transcription successful
- [ ] Speaker diarization works (2 speakers)
- [ ] Transcript saved to Notion

### Analysis
- [ ] Sentiment analysis performed
- [ ] Key events detected
- [ ] Call quality score calculated
- [ ] Summary generated

## Notion Update Testing

### Call Record Creation
- [ ] New page created in Call Records database
- [ ] Linked to lead record
- [ ] Duration captured
- [ ] Status set correctly

### Lead Record Update
- [ ] Last Called date updated
- [ ] Temperature updated if changed
- [ ] Status updated
- [ ] Notes appended

## Alert System Testing

### Test Alert
```bash
curl -X POST http://localhost:3000/api/alerts/test
```
- [ ] SMS received on alert phone
- [ ] Message formatted correctly
- [ ] Timestamp included

### Appointment Alert
- [ ] Trigger: Appointment mentioned in call
- [ ] SMS received with lead details
- [ ] Address and time included

### Escalation Alert
- [ ] Trigger: Complaint raised
- [ ] SMS received with urgency indicator
- [ ] Transcript excerpt included

## Call Trigger System Testing

### Business Hours Check
- [ ] Script runs only during business hours
- [ ] Respects timezone setting
- [ ] Skips weekends

### Rate Limiting
- [ ] Maximum 4 calls per hour
- [ ] Counter resets after 1 hour
- [ ] Respects daily limits

### Lead Filtering
- [ ] Only calls Hot leads
- [ ] Respects 48-hour cooldown
- [ ] Skips DNC leads
- [ ] Sorts by lead score

## End-to-End Testing

### Complete Call Flow
1. [ ] Trigger script initiates call to hot lead
2. [ ] Lead answers phone
3. [ ] AI conversation occurs
4. [ ] Call completes
5. [ ] Recording processed
6. [ ] Transcription generated
7. [ ] Call record created in Notion
8. [ ] Lead record updated
9. [ ] SMS alert sent if appointment

### DNC Flow
1. [ ] Call initiated
2. [ ] Lead requests DNC
3. [ ] AI acknowledges
4. [ ] Call ends
5. [ ] Lead marked DNC in Notion
6. [ ] DNC alert SMS sent

### Voicemail Flow
1. [ ] Call initiated
2. [ ] Voicemail reached
3. [ ] AI leaves message
4. [ ] Call ends
5. [ ] Status set to "Voicemail Left"
6. [ ] Follow-up scheduled

## Security Testing

### Webhook Validation
- [ ] Invalid signatures rejected
- [ ] Valid signatures accepted
- [ ] Returns 200 immediately

### Environment Variables
- [ ] No secrets logged
- [ ] .env in .gitignore
- [ ] No hardcoded credentials

## Performance Testing

### Load Testing
- [ ] Server handles 10 concurrent webhooks
- [ ] Response time < 500ms for health check
- [ ] Memory usage stable

### Rate Limiting
- [ ] Twilio API limits respected
- [ ] Notion API limits respected
- [ ] Deepgram API limits respected

## Deployment Testing

### PM2 Deployment
```bash
pm2 start ecosystem.config.js
```
- [ ] Server starts in production mode
- [ ] Logs written to files
- [ ] Auto-restart on failure

### Docker Deployment
```bash
docker-compose up -d
```
- [ ] Container builds successfully
- [ ] Container starts
- [ ] Health check passes
- [ ] Logs accessible

### Systemd Deployment
```bash
sudo systemctl start ai-calling-system
```
- [ ] Service starts
- [ ] No errors in journal
- [ ] Auto-starts on boot

## Monitoring Setup

### Logging
- [ ] Logs written to logs/combined.log
- [ ] Errors written to logs/error.log
- [ ] Log rotation configured

### Health Monitoring
- [ ] /health endpoint monitored
- [ ] Alerts on service down
- [ ] Response time tracked

## Production Checklist

### Before Going Live
- [ ] All tests passing
- [ ] Environment variables set for production
- [ ] Webhook URLs use HTTPS
- [ ] SSL certificate valid
- [ ] Database backups configured
- [ ] Alert phone number verified
- [ ] Rate limits tested
- [ ] DNC compliance verified

### First Day Monitoring
- [ ] Check logs hourly
- [ ] Verify call quality
- [ ] Confirm Notion updates
- [ ] Monitor SMS alerts
- [ ] Check for errors

## Rollback Plan

If issues occur:
1. Stop call trigger script
2. Disable Twilio webhooks
3. Review error logs
4. Fix issues
5. Test thoroughly
6. Re-enable gradually