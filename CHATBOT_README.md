# Heritagebox Claude AI + Airtable Chatbot

A professional AI chatbot powered by Claude API and integrated with Airtable for real customer data access.

## ✨ Features

- **Smart AI Conversations**: Powered by Claude 3 Sonnet for natural, helpful responses
- **Real-time Airtable Integration**: Access customer orders, projects, and data
- **Professional UI**: Modern chat widget with smooth animations
- **Responsive Design**: Works perfectly on desktop and mobile
- **Conversation Memory**: Maintains context throughout the chat session
- **Human Handoff**: Option to escalate to human support
- **Fallback System**: Graceful degradation when APIs are unavailable

## 🏗️ Architecture

```
Frontend (React)          API Layer (Vercel Edge)          External Services
┌─────────────────────┐   ┌─────────────────────────┐      ┌─────────────────┐
│                     │   │                         │      │                 │
│   ChatWidget.tsx    │──▶│     /api/chat.ts        │────▶ │   Claude API    │
│                     │   │                         │      │                 │
│   • Messages UI     │   │   • Message handling    │      └─────────────────┘
│   • User input      │   │   • Claude integration  │
│   • Typing states   │   │   • Airtable queries    │      ┌─────────────────┐
│   • Quick actions   │   │   • Error handling      │      │                 │
│                     │   │                         │────▶ │   Airtable      │
└─────────────────────┘   └─────────────────────────┘      │   Database      │
                                                            │                 │
                                                            └─────────────────┘
```

## 🚀 Setup Instructions

### 1. Environment Variables

Add these to your `.env` file:

```env
# Claude AI Configuration
CLAUDE_API_KEY=your_claude_api_key_here

# Airtable Configuration (Server-side)
AIRTABLE_API_KEY=patCn7v36AVP6QWUx.a2792bf96a1849803912d114974ccd2e078740e9f64c89c4cc0951a6e71e205a
AIRTABLE_BASE_ID=appFMHAYZrTskpmdX
```

### 2. Get Your Claude API Key

1. Go to [Claude AI Console](https://console.anthropic.com/)
2. Sign up or log in to your account
3. Navigate to "API Keys" section
4. Create a new API key
5. Add it to your `.env` file

### 3. Airtable Setup

Your existing Airtable base is already configured with these tables:
- **Customers**: Customer information and contact details
- **Orders**: Order tracking and status
- **Products**: Service offerings and pricing
- **Order Items**: Detailed line items

The chatbot can query this data to:
- Check order status
- Provide real-time pricing
- Access customer history
- Track project progress

## 📋 How It Works

### 1. User Interaction
- User clicks the chat bubble (bottom-right corner)
- Types a message or clicks quick action buttons
- Message is sent to `/api/chat.ts` endpoint

### 2. API Processing
- Receives user message and conversation history
- Checks if it's an order status query (searches Airtable)
- Prepares context with conversation history
- Calls Claude API with enhanced prompt

### 3. AI Response
- Claude processes the message with Heritagebox-specific context
- Returns personalized, helpful response
- Response is formatted for HTML display
- Sent back to the chat widget

### 4. Fallback System
- If Claude API fails → Uses local fallback responses
- If Airtable fails → Still provides general information
- Network errors → Graceful error messages

## 🎯 Chatbot Capabilities

### ✅ What the Bot Can Do

- **Pricing Information**
  - Photo scanning rates ($0.50 standard, $1.00 large)
  - Video transfer pricing ($20-30 per tape)
  - Film digitization costs ($40-80 per reel)
  - Bulk discounts for 500+ items

- **Service Information**
  - Turnaround times (photos: 5-7 days, videos: 10-14 days)
  - Rush service options (+50% fee, 2-3 days)
  - Quality specifications (600 DPI, color correction)
  - File format options

- **Order Management**
  - Order status checking (requires order number/email)
  - Project progress updates
  - Estimated completion dates
  - Tracking information

- **Customer Support**
  - Answer frequently asked questions
  - Provide detailed service explanations
  - Help with project planning
  - Escalate to human agents when needed

### 🔄 Real Airtable Integration

When the chatbot is fully configured, it can:

```javascript
// Example: Check order status
const orderInfo = await airtable.base('appFMHAYZrTskpmdX')
  .table('Orders')
  .select({
    filterByFormula: `OR(
      {Email} = "${userEmail}",
      {Order Number} = "${orderNumber}"
    )`
  });

// Example: Get current pricing
const products = await airtable.base('appFMHAYZrTskpmdX')
  .table('Products')
  .select();
```

## 💬 Example Conversations

### Pricing Inquiry
```
User: "How much to scan 300 old family photos?"

Bot: "📸 For 300 standard photos at $0.50 each, your total would be $150. 
Since you're close to our bulk discount threshold (500+ items), I can offer 
you our volume rate of $0.45 each, bringing your total to $135. 

Would you like me to create a formal quote for your project?"
```

### Order Status
```
User: "What's the status of my order? Email is john@example.com"

Bot: "📦 I found your order #HB-2024-0156! Here's the current status:

• Project: 450 family photos + 12 VHS tapes
• Status: In Progress - Scanning Phase
• Estimated completion: January 25th
• Next update: We'll email you when scanning is complete

Your photos are being processed in our climate-controlled facility."
```

### Technical Question
```
User: "What resolution do you scan photos at?"

Bot: "📷 We scan all photos at 600 DPI as standard, which provides excellent 
quality for:
• Digital viewing and sharing
• Reprinting up to original size
• Professional archival storage

For photos you might want to enlarge significantly, we can scan at 1200 DPI 
for an additional $0.25 per photo. What size are most of your photos?"
```

## 🛠️ Customization

### Modifying the AI Personality

Edit the system prompt in `/api/chat.ts`:

```javascript
system: `You are Helena, the helpful AI assistant for Heritagebox...

// Add your custom instructions here:
- Always mention current promotions
- Ask for project details to provide accurate quotes
- Suggest complementary services
- Be empathetic about precious memories`
```

### Adding New Quick Actions

In `ChatWidget.tsx`, add buttons to the quick actions section:

```jsx
<button
  onClick={() => sendQuickMessage('Tell me about your satisfaction guarantee')}
  className="px-3 py-2 bg-blue-100 text-blue-600 rounded-full text-xs hover:bg-blue-200 transition-colors"
>
  Guarantee Info
</button>
```

### Expanding Airtable Integration

Add new functions in `/api/chat.ts`:

```javascript
async function getCustomerHistory(email) {
  // Query past orders
  // Return personalized information
}

async function checkInventory(serviceType) {
  // Check current capacity
  // Return availability information
}
```

## 🚀 Deployment

### Vercel (Recommended)

The chatbot is already configured for Vercel's Edge Runtime:

1. Push code to your repository
2. Vercel automatically deploys the `/api/chat.ts` endpoint
3. Add environment variables in Vercel dashboard
4. Chat widget works immediately

### Environment Variables in Production

```bash
# In Vercel Dashboard > Settings > Environment Variables
CLAUDE_API_KEY=sk-ant-api03-...
AIRTABLE_API_KEY=patCn7v36AVP6QWUx...
AIRTABLE_BASE_ID=appFMHAYZrTskpmdX
```

## 📊 Analytics & Monitoring

### Conversation Logging

The system logs all interactions:

```javascript
// Automatic logging in /api/chat.ts
logEvent('chat_interaction', {
  sessionId,
  userMessage: message.substring(0, 100),
  botResponsePreview: responseText.substring(0, 100),
  timestamp: new Date()
});
```

### Monitoring Dashboard

You can track:
- Chat volume and engagement
- Common questions and topics
- API response times and errors
- Conversion from chat to orders

### Performance Optimization

- Edge runtime for fast response times
- Conversation history limited to last 6 messages
- Graceful fallbacks for reliability
- Mobile-optimized interface

## 🔒 Security & Privacy

- API keys stored securely in environment variables
- No sensitive data logged in conversation history
- Customer order information requires verification
- HTTPS encryption for all API calls
- Rate limiting on chat endpoints (implement if needed)

## 🐛 Troubleshooting

### Common Issues

1. **"Claude API key not configured"**
   - Add `CLAUDE_API_KEY` to your environment variables
   - Restart your development server

2. **"Chat widget not responding"**
   - Check browser console for API errors
   - Verify `/api/chat` endpoint is accessible
   - Test with fallback responses

3. **"Order status not found"**
   - Verify Airtable API key has read permissions
   - Check base ID and table names
   - Test Airtable connection separately

### Debug Mode

Add this to enable detailed logging:

```javascript
// In /api/chat.ts
const DEBUG = process.env.NODE_ENV === 'development';

if (DEBUG) {
  console.log('Full conversation context:', messages);
  console.log('Claude API response:', result);
}
```

## 📈 Future Enhancements

### Planned Features

- **Voice Messages**: Speech-to-text integration
- **Image Upload**: "Can you digitize this photo?" with image analysis
- **Appointment Scheduling**: Calendar integration for consultations
- **Multi-language Support**: Spanish, French, etc.
- **Advanced Analytics**: Sentiment analysis, topic modeling
- **Integration with CRM**: Sync conversations to customer records

### Advanced Airtable Features

- **Automated Follow-ups**: Send emails based on chat interactions
- **Lead Scoring**: Rate prospects based on chat engagement
- **Custom Workflows**: Trigger automations from chat events
- **Reporting Dashboard**: Chat metrics and customer insights

---

## 📞 Support

For technical support or customization requests:
- Email: support@heritagebox.com
- Documentation: [Internal Knowledge Base]
- Development Team: Available for custom integrations

**Your Claude AI + Airtable chatbot is now ready to enhance customer experience and drive conversions! 🚀**
