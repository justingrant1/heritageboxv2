const express = require('express');
const cors = require('cors');
const { Anthropic } = require('@anthropic-ai/sdk');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Initialize Claude AI
const anthropic = new Anthropic({
  apiKey: process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY,
});

// Simple in-memory session storage
const sessions = new Map();

// Heritagebox-specific prompt
const SYSTEM_PROMPT = `You are a helpful AI assistant for Heritagebox, a professional media digitization company. You help customers with:

- Photo digitization pricing and services
- Video transfer options and pricing  
- Order status inquiries
- Turnaround times and scheduling
- General questions about digitization services

Key pricing info:
- Standard photos: $0.50 each
- Large photos (8x10+): $1.00 each
- Slides/negatives: $0.75 each
- VHS/VHS-C: $25 per tape
- 8mm/Hi8/Digital8: $30 per tape
- MiniDV: $20 per tape
- Film reels (8mm/16mm): $40-80 per reel

Current turnaround times:
- Photos: 5-7 business days
- Videos: 10-14 business days
- Large projects: 3-4 weeks
- Rush service available: +50% fee, 2-3 days

Be helpful, professional, and concise. If you need specific customer information for order status, ask for order number, email, or name + phone.`;

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Main chat endpoint
app.post('/chat', async (req, res) => {
  try {
    const { message, sessionId } = req.body;

    if (!message || !sessionId) {
      return res.status(400).json({ 
        success: false, 
        error: 'Message and sessionId are required' 
      });
    }

    // Get or create session
    if (!sessions.has(sessionId)) {
      sessions.set(sessionId, []);
    }

    const sessionMessages = sessions.get(sessionId);
    
    // Add user message to session
    sessionMessages.push({ role: 'user', content: message });

    // Prepare messages for Claude (keep last 10 messages to avoid token limits)
    const recentMessages = sessionMessages.slice(-10);

    console.log(`Processing message for session ${sessionId}: ${message.substring(0, 100)}...`);

    // Call Claude AI
    const response = await anthropic.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 1000,
      system: SYSTEM_PROMPT,
      messages: recentMessages
    });

    const assistantMessage = response.content[0].text;

    // Add assistant response to session
    sessionMessages.push({ role: 'assistant', content: assistantMessage });

    console.log(`Response generated for session ${sessionId}: ${assistantMessage.substring(0, 100)}...`);

    res.json({ 
      success: true, 
      response: assistantMessage,
      sessionId: sessionId
    });

  } catch (error) {
    console.error('Chat error:', error);
    
    let errorMessage = 'I apologize, but I\'m having technical difficulties right now.';
    
    if (error.message?.includes('API key')) {
      errorMessage = 'Configuration issue with AI service. Please contact support.';
    } else if (error.message?.includes('rate limit')) {
      errorMessage = 'Service is temporarily busy. Please try again in a moment.';
    } else if (error.message?.includes('timeout')) {
      errorMessage = 'Request timed out. Please try again.';
    }

    res.status(500).json({ 
      success: false, 
      error: errorMessage,
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Simple test endpoint
app.get('/test', (req, res) => {
  res.json({ 
    message: 'Heritagebox Chat Server is running!',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Clear session endpoint (for testing)
app.delete('/session/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  sessions.delete(sessionId);
  res.json({ success: true, message: 'Session cleared' });
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Server error:', error);
  res.status(500).json({ 
    success: false, 
    error: 'Internal server error',
    details: process.env.NODE_ENV === 'development' ? error.message : undefined
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Heritagebox Chat Server running on port ${PORT}`);
  console.log(`📍 Health check: http://localhost:${PORT}/health`);
  console.log(`🧪 Test endpoint: http://localhost:${PORT}/test`);
  console.log(`💬 Chat endpoint: http://localhost:${PORT}/chat`);
});

module.exports = app;
