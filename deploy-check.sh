#!/bin/bash
# Quick deployment verification script for AI Calling System
# Run this after deploying to Render to verify everything is working

echo "=========================================="
echo "AI Calling System - Deployment Checklist"
echo "=========================================="
echo ""

# Check if RENDER_URL is provided
if [ -z "$1" ]; then
  echo "Usage: ./deploy-check.sh <your-render-url>"
  echo "Example: ./deploy-check.sh https://ai-calling-system-xxx.onrender.com"
  exit 1
fi

RENDER_URL=$1

echo "1. Testing health endpoint..."
HEALTH_RESPONSE=$(curl -s "$RENDER_URL/health")
if echo "$HEALTH_RESPONSE" | grep -q '"status":"healthy"'; then
  echo "   ✅ Server is healthy"
  echo "   Services status:"
  echo "$HEALTH_RESPONSE" | grep -o '"notion":[^,]*' | sed 's/^/   - /'
  echo "$HEALTH_RESPONSE" | grep -o '"callsDb":[^,]*' | sed 's/^/   - /'
  echo "$HEALTH_RESPONSE" | grep -o '"deepgram":[^}]*' | sed 's/^/   - /'
else
  echo "   ❌ Health check failed"
  echo "   Response: $HEALTH_RESPONSE"
fi

echo ""
echo "2. Testing root endpoint..."
ROOT_RESPONSE=$(curl -s "$RENDER_URL/")
if echo "$ROOT_RESPONSE" | grep -q '"name":"AI Calling System'; then
  echo "   ✅ Root endpoint responding"
  echo "   $(echo "$ROOT_RESPONSE" | grep -o '"version":"[^"]*"' | sed 's/^/   /')"
else
  echo "   ❌ Root endpoint failed"
fi

echo ""
echo "=========================================="
echo "Next Steps:"
echo "=========================================="
echo ""
echo "1. Copy this webhook URL to ElevenLabs:"
echo "   ${RENDER_URL}/webhooks/twilio/status"
echo ""
echo "2. In ElevenLabs Conversational AI settings:"
echo "   - Go to: https://elevenlabs.io/app/conversational-ai"
echo "   - Select your agent → Settings → Webhook"
echo "   - Paste the URL above"
echo ""
echo "3. Test a call and check Render logs:"
echo "   https://dashboard.render.com/web/services/ai-calling-system/logs"
echo ""
echo "4. Verify Notion integration:"
echo "   - Check your Calls database for new records"
echo ""
echo "=========================================="
