# Slack Integration Setup Guide

This guide will help you set up the Slack integration for the "Talk to Human" feature in your Heritagebox chatbot.

## 🚀 Quick Setup

### Step 1: Create a Slack App

1. Go to [Slack API Apps](https://api.slack.com/apps)
2. Click "Create New App"
3. Choose "From scratch"
4. App Name: `Heritagebox Support Bot`
5. Workspace: Select your Heritagebox workspace
6. Click "Create App"

### Step 2: Configure Bot Permissions

1. In your app dashboard, go to "OAuth & Permissions"
2. Scroll down to "Scopes" → "Bot Token Scopes"
3. Add these permissions:
   - `chat:write` (Send messages as the bot)
   - `channels:read` (View basic channel info)
   - `groups:read` (View basic private channel info)

### Step 3: Install App to Workspace

1. Still in "OAuth & Permissions"
2. Click "Install to Workspace" at the top
3. Review permissions and click "Allow"
4. Copy the "Bot User OAuth Token" (starts with `xoxb-`)

### Step 4: Add Bot to Support Channel

1. In Slack, go to your support channel (e.g., `#customer-support`)
2. Type `/invite @Heritagebox Support Bot`
3. Or go to channel settings → Integrations → Add apps

### Step 5: Configure Environment Variables

Add these to your `.env` file:

```env
# Slack Integration
SLACK_BOT_TOKEN=xoxb-your-bot-token-here
SLACK_SUPPORT_CHANNEL=#customer-support
SITE_URL=https://heritagebox.com
```

### Step 6: Test the Integration

1. Go to your website
2. Open the chat widget
3. Click "Talk to Human"
4. Check your Slack channel for the notification

## 📋 What Happens When Someone Clicks "Talk to Human"

### 1. Customer Experience
```
Customer clicks "Talk to Human" button
↓
Shows message: "Connecting you to a human agent..."
↓
Displays: "Human support has been notified. Someone will assist you shortly."
```

### 2. Slack Notification
Your support team receives a formatted message containing:

```
🚨 Customer Requesting Human Support

Customer: John Doe
Email: john@example.com
Time: 1/20/2025, 1:05:23 AM
Status: Awaiting human response

Recent Conversation:
👤 Customer: How much to digitize 200 old photos?
🤖 Bot: For 200 standard photos at $0.50 each, your total would be $100...
👤 Customer: I need to speak to someone about bulk pricing

[Respond on Website] [Call Customer]
```

### 3. Team Response Options
- **Respond on Website**: Click to go to your website and respond via chat
- **Call Customer**: Take action to call the customer directly
- **Follow up via email**: Use the provided email address

## 🛠️ Advanced Configuration

### Custom Channel Names

To use a different channel, update your environment variable:
```env
SLACK_SUPPORT_CHANNEL=#sales-inquiries
# or
SLACK_SUPPORT_CHANNEL=#urgent-support
# or use channel ID
SLACK_SUPPORT_CHANNEL=C1234567890
```

### Multiple Channels by Type

You can modify the API to route to different channels based on conversation context:

```javascript
// In api/request-human.ts
let channelId = process.env.SLACK_SUPPORT_CHANNEL || '#customer-support';

// Route based on conversation content
if (conversationSummary.includes('pricing') || conversationSummary.includes('quote')) {
    channelId = '#sales-team';
} else if (conversationSummary.includes('order') || conversationSummary.includes('status')) {
    channelId = '#order-support';
}
```

### Custom Message Templates

Edit the message format in `api/request-human.ts`:

```javascript
blocks: [
    {
        type: 'section',
        text: {
            type: 'mrkdwn',
            text: '🚨 *Urgent: Customer Needs Help!*'
        }
    },
    // Add your custom blocks here
]
```

## 🔧 Troubleshooting

### "Slack API error: channel_not_found"

**Problem**: The bot can't find the specified channel.

**Solutions**:
1. Make sure the bot is added to the channel
2. Use channel ID instead of name: `C1234567890`
3. Check channel name spelling (include # for public channels)

### "Slack API error: not_authed"

**Problem**: Invalid bot token.

**Solutions**:
1. Regenerate the bot token in Slack app settings
2. Make sure you're using the "Bot User OAuth Token", not "OAuth Access Token"
3. Verify the token starts with `xoxb-`

### "Slack API error: missing_scope"

**Problem**: Bot doesn't have required permissions.

**Solutions**:
1. Add `chat:write` permission in OAuth & Permissions
2. Reinstall the app to workspace
3. Make sure bot is added to the target channel

### Messages Not Appearing

**Checklist**:
- [ ] Bot token is correct and starts with `xoxb-`
- [ ] Bot is installed in your workspace
- [ ] Bot is added to the target channel
- [ ] Environment variables are set correctly
- [ ] Channel name/ID is correct

### Testing the Integration

You can test without the frontend by calling the API directly:

```bash
curl -X POST http://localhost:8080/api/request-human \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"sender": "user", "content": "I need help with pricing"},
      {"sender": "bot", "content": "I can help with that. What would you like to know?"},
      {"sender": "user", "content": "I want to talk to a human"}
    ],
    "customerInfo": {
      "name": "Test Customer",
      "email": "test@example.com"
    }
  }'
```

## 📊 Monitoring & Analytics

### Slack Message Logs

The system logs all Slack interactions:

```javascript
// Success log
{
  "timestamp": "2025-01-20T06:05:23.123Z",
  "event": "slack_notification_sent",
  "success": true,
  "messageTs": "1642665923.123456",
  "channel": "C1234567890"
}

// Error log
{
  "timestamp": "2025-01-20T06:05:23.123Z",
  "event": "slack_notification_failed",
  "error": "channel_not_found",
  "channel": "#wrong-channel"
}
```

### Response Time Tracking

You can track how quickly your team responds by adding Slack thread replies:

```javascript
// When human responds, they can reply to the Slack thread
// This creates a full audit trail of the support interaction
```

## 🚀 Production Deployment

### Vercel Environment Variables

In your Vercel dashboard:

1. Go to Settings → Environment Variables
2. Add:
   - `SLACK_BOT_TOKEN` = `xoxb-your-token-here`
   - `SLACK_SUPPORT_CHANNEL` = `#customer-support`
   - `SITE_URL` = `https://yourdomain.com`

### Security Best Practices

1. **Token Security**: Never commit Slack tokens to git
2. **Channel Permissions**: Use private channels for sensitive customer data
3. **Rate Limiting**: Implement rate limiting to prevent spam
4. **Data Retention**: Consider Slack's message retention policies

## 🔄 Alternative: Using Your Slack MCP Server

If you prefer to use your existing MCP server instead of direct Slack API calls, you can modify the API:

```javascript
// Instead of direct Slack API call, use MCP
const mcpResponse = await fetch('http://localhost:3001/mcp/slack/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
        channel: slackChannelId,
        message: conversationSummary,
        blocks: slackBlocks
    })
});
```

This gives you more control and consistency with your existing MCP infrastructure.

---

## 📞 Need Help?

If you encounter issues with the Slack integration:

1. Check the browser console for API errors
2. Look at Vercel function logs for backend errors
3. Test your Slack bot permissions in Slack app settings
4. Verify environment variables are set correctly

**Your Slack integration is now ready to connect customers with human support! 🎉**
