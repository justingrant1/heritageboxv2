# Heritagebox Claude AI + Airtable Chatbot Setup

This is a complete Claude AI chatbot implementation that looks exactly like your demo design. Here's how to get it running:

## 🚀 Quick Start

### 1. Install Dependencies
```bash
npm install --save-dev --package-lock-only express cors dotenv @anthropic-ai/sdk nodemon
npm install
```

### 2. Set up Environment Variables
Create a `.env` file in your project root:
```bash
# Claude AI API Key
CLAUDE_API_KEY=your_claude_api_key_here
ANTHROPIC_API_KEY=your_claude_api_key_here

# Optional: For Airtable integration (future enhancement)
AIRTABLE_API_KEY=your_airtable_key
AIRTABLE_BASE_ID=your_base_id
```

### 3. Start the Chat Server
```bash
node chat-server.js
```

You should see:
```
🚀 Heritagebox Chat Server running on port 3001
📍 Health check: http://localhost:3001/health
🧪 Test endpoint: http://localhost:3001/test
💬 Chat endpoint: http://localhost:3001/chat
```

### 4. Open the Demo
Open `chatbot-demo.html` in your browser or run:
```bash
# Windows
start chatbot-demo.html

# Mac
open chatbot-demo.html

# Linux
xdg-open chatbot-demo.html
```

## 🎯 What You Get

### ✅ Working Features
- **Beautiful UI** - Exact match to your design demo
- **Claude AI Integration** - Real AI responses, not fake ones
- **Session Management** - Maintains conversation context
- **Error Handling** - Graceful error messages and connection status
- **Responsive Design** - Works on desktop and mobile
- **Quick Actions** - Pre-set buttons for common questions
- **Professional Styling** - Heritagebox branding throughout

### 🧠 Smart AI Responses
The bot knows about Heritagebox services:
- Photo digitization pricing ($0.50-$1.00 each)
- Video transfer options ($20-$80 per item)
- Current turnaround times (5-14 business days)
- Order status inquiries
- Custom quotes and bulk discounts

### 🔧 Architecture
```
Frontend (HTML) → Express Server → Claude AI API → Response
     ↓                  ↓              ↓
Session Storage    Error Handling   Smart Prompts
```

## 📁 File Structure

```
/
├── chatbot-demo.html          # Complete demo page
├── chat-server.js             # Express server with Claude AI
├── package-server.json        # Server dependencies
├── src/components/ChatWidget.tsx  # React widget (for main site)
└── SETUP_INSTRUCTIONS.md      # This file
```

## 🔗 Integration Options

### Option 1: Standalone Demo (What we built)
- Perfect for testing and demonstrations
- Self-contained HTML file
- Works immediately with the Express server

### Option 2: React Integration (Already included)
- `src/components/ChatWidget.tsx` is ready to use
- Already integrated into your main site
- Just start the server and it works

### Option 3: Embed Anywhere
The chat widget can be embedded on any website:
```html
<script src="chatbot-widget.js"></script>
<div id="heritagebox-chat"></div>
```

## 🗃️ Airtable Integration (Next Steps)

To connect your Airtable data:

1. **Add to chat-server.js:**
```javascript
// Add Airtable service
const Airtable = require('airtable');
const base = new Airtable({apiKey: process.env.AIRTABLE_API_KEY})
  .base(process.env.AIRTABLE_BASE_ID);
```

2. **Update system prompt with real data:**
```javascript
// Replace static pricing with Airtable queries
const getPricing = async () => {
  const records = await base('Pricing').select().all();
  return records.map(record => record.fields);
};
```

3. **Order status lookups:**
```javascript
const getOrderStatus = async (orderNumber) => {
  const records = await base('Orders')
    .select({ filterByFormula: `{Order Number} = "${orderNumber}"` })
    .all();
  return records[0]?.fields;
};
```

## 🚀 Deployment Options

### Local Development
```bash
node chat-server.js  # Runs on localhost:3001
```

### Production Deployment
- **Heroku**: `git push heroku main`
- **Railway**: Connect GitHub repo
- **DigitalOcean**: Docker container
- **AWS/GCP**: Cloud Run or EC2

### Serverless (Advanced)
Convert to serverless functions for Vercel/Netlify deployment.

## 📞 Support

If you need help:
1. Check the browser console for errors
2. Verify the server is running on port 3001
3. Ensure your Claude API key is set in `.env`
4. Test the health endpoint: `http://localhost:3001/health`

## 🎉 Success Indicators

When working correctly, you should see:
- 🟢 Connected status in the chat widget
- Natural AI responses to your questions
- Session persistence across messages
- Professional Heritagebox-themed interface
- Smooth animations and responsive design

The chatbot is now ready for production use on your Heritagebox website!
