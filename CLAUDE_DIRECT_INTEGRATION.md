# Claude AI Direct Integration - Implementation Guide

## Overview

Your chatbot now makes **direct API calls to Claude AI** from the frontend JavaScript, eliminating the server-side bottleneck that was causing issues. This provides:

✅ **Direct Claude API access** from your React components  
✅ **Real-time order lookup** via Airtable integration  
✅ **Intelligent response routing** (AI vs Human vs Order lookup)  
✅ **Enhanced conversation context** with pricing data  
✅ **Fallback to human agents** when needed  

## Architecture Changes

### Before (Problematic)
```
User Message → ChatWidget → /api/chat → Server → Claude API → Response
```

### After (Fixed)
```
User Message → ChatWidget → Claude Service → Claude API → Response
              ↓
         Airtable Service → Order Lookup → Enhanced Response
```

## New File Structure

### 1. `src/services/claudeService.ts`
- Direct Claude API integration
- Message formatting and conversation history
- System prompt management
- Token limit handling
- Error handling with fallbacks

### 2. `src/services/airtableService.ts`
- Customer order lookups by email or order number
- Product and pricing information retrieval
- Order status and details formatting
- Integration with existing Airtable utilities

### 3. Updated `src/components/ChatWidget.tsx`
- Intelligent message routing
- Order lookup detection via regex patterns
- Enhanced AI conversations with pricing context
- Maintained human handoff functionality

## Key Features

### 🔍 Smart Order Lookup
The chatbot automatically detects when users are asking about orders:
- Recognizes email addresses and order numbers in messages
- Searches Airtable for matching customer records
- Provides formatted order status, items, and details
- Suggests next steps or human assistance

### 🤖 Enhanced AI Responses  
- Direct Claude API calls with full conversation context
- Dynamic system prompts with current pricing data
- Intelligent routing between AI and data lookup
- Graceful error handling with user-friendly messages

### 💰 Real-Time Pricing Integration
- Fetches current package pricing from Airtable
- Includes pricing context in AI responses about costs
- Fallback to default pricing if Airtable is unavailable

### 🔄 Hybrid Response System
```javascript
if (isOrderLookupRequest(message)) {
  // Direct Airtable lookup with formatted results
  handleOrderLookup(message)
} else {
  // Claude AI conversation with enhanced context
  handleClaudeConversation(message)
}
```

## Configuration Requirements

### Environment Variables (.env)
```bash
# Claude AI (Frontend & Backend)
CLAUDE_API_KEY=sk-ant-api03-...
VITE_CLAUDE_API_KEY=sk-ant-api03-...

# Airtable (Frontend & Backend)  
AIRTABLE_API_KEY=patCn7v36AVP6QWUx...
VITE_AIRTABLE_API_KEY=patCn7v36AVP6QWUx...
AIRTABLE_BASE_ID=appFMHAYZrTskpmdX
VITE_AIRTABLE_BASE_ID=appFMHAYZrTskpmdX

# Slack (Human Handoff)
SLACK_BOT_TOKEN=xoxb-...
SLACK_SUPPORT_CHANNEL=#vip-sales
```

## Usage Examples

### Order Status Inquiry
```
User: "Can you check my order status? My email is john@example.com"

Bot: "✅ Order Information Found

**Customer: John Smith**
📧 Email: john@example.com
📱 Phone: (555) 123-4567

**Orders (1):**

**Order HB-2024-001**
⏳ Status: Processing
📅 Order Date: 2024-01-15
💰 Total: $149.99
• Standard Package - $99.99
• Photo Restoration - $25.00
• Express Shipping - $25.00

Is there anything specific about this order you'd like to know more about?"
```

### Pricing Inquiry with Real-Time Data
```
User: "What are your current package prices?"

Bot: "💰 Here are our current package prices:

• Essential Package: $49
• Standard Package: $99  
• Premium Package: $199

Each package includes different features and digitization limits. The Essential package is great for smaller collections, while Premium offers unlimited items and priority processing.

Would you like me to explain what's included in each package or help you choose the best option for your needs?"
```

### General Support with AI
```
User: "How long does video transfer take?"

Bot: "🎬 Video transfer typically takes 10-14 business days for standard processing. Here's our current breakdown:

• VHS/VHS-C: $25 per tape (10-14 days)
• 8mm/Hi8/Digital8: $30 per tape (10-14 days)  
• MiniDV: $20 per tape (7-10 days)
• Film reels: $40-80 per reel (14-21 days)

We also offer rush processing for an additional 50% fee, which reduces turnaround to 3-5 business days.

What type of videos are you looking to digitize?"
```

## Testing the Integration

Run the test script to verify everything is working:

```bash
npm run dev
# Then in browser console or separate script:
node test-claude-integration.js
```

Expected output:
```
🧪 Testing Claude AI Integration...
✅ Claude API connected successfully
✅ Airtable service connected successfully  
✅ Package pricing retrieved successfully
🎉 All integration tests passed!
```

## Error Handling

The system includes comprehensive error handling:

1. **Claude API Errors**: Fallback to human handoff suggestion
2. **Airtable Connection Issues**: Graceful degradation with default responses
3. **Network Problems**: User-friendly error messages with retry suggestions
4. **Invalid Order Lookups**: Clear guidance on what information is needed

## Security Considerations

- ✅ API keys properly configured in environment variables
- ✅ Frontend keys use VITE_ prefix for client-side access
- ✅ Rate limiting handled by Claude SDK
- ✅ No sensitive customer data logged in console
- ✅ Error messages don't expose internal system details

## Performance Benefits

- **Faster Responses**: Direct API calls eliminate server bottlenecks
- **Reduced Server Load**: Claude processing moved to client-side
- **Real-Time Data**: Direct Airtable integration for current information
- **Better UX**: Immediate order lookups without server round-trips

## Deployment Notes

1. Ensure all environment variables are set in production
2. Test Claude API quota limits for your expected usage
3. Monitor Airtable API usage for rate limiting
4. Consider implementing client-side caching for frequent lookups

## Troubleshooting

### Claude API Issues
- Verify `VITE_CLAUDE_API_KEY` is correctly set
- Check browser network tab for CORS errors
- Ensure API key has sufficient credits

### Airtable Issues  
- Verify `VITE_AIRTABLE_API_KEY` and `VITE_AIRTABLE_BASE_ID`
- Check table permissions in Airtable
- Validate table structure matches expected schema

### Order Lookup Problems
- Ensure customer data exists in Airtable
- Check email format matching (case sensitivity)
- Verify order number format patterns

## Success Metrics

Your chatbot now provides:
- 🚀 **Instant responses** via direct Claude API
- 📊 **Real-time order data** from Airtable
- 🎯 **Smart routing** between AI and data lookup
- 🔄 **Seamless handoff** to human agents when needed
- 💡 **Context-aware responses** with current pricing

The integration eliminates your previous server-side issues while providing enhanced functionality and better user experience.
