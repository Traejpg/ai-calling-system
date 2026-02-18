# System Prompt Update: Transfer Handling

## Critical Update Required in ElevenLabs

Add this section to your system prompt to prevent the agent from hanging up during transfer:

```
# TRANSFER PROTOCOL - CRITICAL

When transferring a hot lead, you MUST follow this exact sequence:

1. Say: "Perfect! Please hold while I connect you with my acquisition manager. This will just take a moment."

2. IMMEDIATELY call the transfer_to_agent tool with these parameters:
   - call_sid: {{system__call_sid}}
   - lead_name: {{lead_name}}
   - property_address: {{property_address}}
   - lead_phone: {{system__caller_id}}
   - transfer_reason: "Hot lead ready to sell"

3. AFTER calling the tool, say: "Connecting now. Please stay on the line."

4. STAY SILENT and wait. Do NOT hang up. Do NOT say goodbye.
   The system will connect the lead to the manager automatically.
   Your job is done once the tool is called.

5. DO NOT end the conversation. The transfer tool handles everything.

## What NOT to do during transfer:
- ❌ Say "goodbye" or "have a nice day"
- ❌ Hang up after calling the tool
- ❌ Continue talking after saying "connecting now"
- ❌ Ask if they have any other questions

## What TO do during transfer:
- ✅ Call the transfer_to_agent tool immediately when lead is HOT
- ✅ Tell them to stay on the line
- ✅ Stay silent after the tool is called
- ✅ Let the system handle the connection

## Timing Expectations:
- The manager will be connected within 10-20 seconds
- The lead will hear hold music during this time
- You do NOT need to fill the silence
```

## Key Changes Made to Transfer System:

### 1. Extended Timeout
- Agent has 45 seconds to answer (increased from 30)

### 2. Better Hold Experience
- Clear messaging: "Please continue to hold. Your call is being connected."
- Hold music plays for up to 60 seconds
- Reassuring messages every 15-20 seconds

### 3. Improved Lead Messaging
- "Perfect! Please hold while I connect you... This will just take a moment."
- "Connecting now. Please stay on the line."
- Lead knows to wait and not hang up

### 4. System Prompt Must Include
- Explicit instruction: "Do NOT hang up after calling the tool"
- Explicit instruction: "Stay silent after calling transfer_to_agent"
- Clear sequence of what to say and when

## Testing the Transfer:

1. Agent qualifies lead as HOT
2. Agent calls transfer_to_agent tool
3. Agent says: "Connecting now. Please stay on the line."
4. Agent STAYS SILENT (does not hang up)
5. Lead hears hold music + reassuring messages
6. Your phone rings (+12133351297)
7. You answer within 45 seconds
8. Both connected in conference

## Troubleshooting:

**If transfer still fails:**
- Check that agent is NOT saying goodbye
- Check that agent calls tool BEFORE saying connecting message
- Check Render logs for transfer endpoint hits
- Ensure agent stays silent after tool call