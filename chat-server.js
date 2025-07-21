const express = require('express');
const cors = require('cors');
const { Anthropic } = require('@anthropic-ai/sdk');
const Airtable = require('airtable');
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

// Airtable configuration
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID || 'appFMHAYZrTskpmdX';

// Table IDs
const TABLES = {
  CUSTOMERS: 'tblUS7uf11axEmL56',
  PRODUCTS: 'tblJ0hgzvDXWgQGmK',
  ORDERS: 'tblTq25QawVDHTTkV',
  ORDER_ITEMS: 'tblgV4XGeQE3VL9CW',
  CHAT_TRANSCRIPTS: 'tbl6gHHlvSwx4gQpB',
  PROSPECTS: 'tblogFLfRkbopp0fK'
};

// Initialize Airtable
let base = null;
if (AIRTABLE_API_KEY && AIRTABLE_BASE_ID) {
  try {
    base = new Airtable({ apiKey: AIRTABLE_API_KEY }).base(AIRTABLE_BASE_ID);
    console.log('✅ AIRTABLE - Connected successfully');
  } catch (error) {
    console.warn('⚠️ AIRTABLE WARNING - Failed to initialize:', error);
  }
} else {
  console.warn('⚠️ AIRTABLE WARNING - Missing API key or Base ID. Chatbot will use fallback pricing.');
}

// Simple in-memory session storage with metadata
const sessions = new Map();
const sessionMetadata = new Map(); // Store session start time, extracted data, etc.

// Cache for product data (refreshed every 5 minutes)
let productsCache = null;
let cacheTimestamp = null;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// Chat storage and lead capture functions
const extractEmailFromMessage = (message) => {
  const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
  const matches = message.match(emailRegex);
  return matches ? matches[0] : null;
};

const extractDataFromConversation = (messages) => {
  const fullConversation = messages.map(m => m.content).join(' ').toLowerCase();
  
  const data = {
    email: null,
    name: null,
    phone: null,
    mediaTypes: [],
    quantities: [],
    inquiryTypes: [],
    notes: []
  };

  // Extract email from any message
  for (const message of messages) {
    const email = extractEmailFromMessage(message.content);
    if (email && !data.email) {
      data.email = email;
    }
  }

  // Extract name patterns (I'm, My name is, This is, etc.)
  const namePatterns = [
    /(?:my name is|i'm|i am|this is) ([a-zA-Z\s]+)/gi,
    /(?:^|\s)([A-Z][a-z]+ [A-Z][a-z]+)(?:\s|$)/g // First Last name pattern
  ];
  for (const pattern of namePatterns) {
    const nameMatch = fullConversation.match(pattern);
    if (nameMatch && nameMatch[1] && !data.name) {
      data.name = nameMatch[1].trim();
      break;
    }
  }

  // Extract phone numbers
  const phonePattern = /(\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})/g;
  const phoneMatch = fullConversation.match(phonePattern);
  if (phoneMatch) {
    data.phone = phoneMatch[0];
  }

  // Extract media types
  const mediaKeywords = {
    'Photos': ['photo', 'picture', 'image', 'snapshot'],
    'Slides': ['slide', 'kodachrome', '35mm slide'],
    'Negatives': ['negative', 'film strip'],
    'VHS Tapes': ['vhs', 'video tape', 'vcr'],
    '8mm Film': ['8mm', 'super 8', 'film reel'],
    '16mm Film': ['16mm'],
    'MiniDV': ['minidv', 'mini dv', 'digital video'],
    'Hi8': ['hi8', 'hi-8'],
    'Betamax': ['betamax', 'beta'],
    'Documents': ['document', 'paper', 'certificate']
  };

  for (const [mediaType, keywords] of Object.entries(mediaKeywords)) {
    for (const keyword of keywords) {
      if (fullConversation.includes(keyword)) {
        if (!data.mediaTypes.includes(mediaType)) {
          data.mediaTypes.push(mediaType);
        }
      }
    }
  }

  // Extract quantities mentioned
  const quantityPatterns = [
    /(\d+)\s*(photo|picture|image|slide|tape|reel|negative|video)/gi,
    /(hundred|thousand|dozens?|lots?)\s+of\s+(photo|picture|image|slide|tape|reel)/gi
  ];
  for (const pattern of quantityPatterns) {
    const matches = fullConversation.matchAll(pattern);
    for (const match of matches) {
      data.quantities.push(`${match[1]} ${match[2]}s`);
    }
  }

  // Extract inquiry types
  const inquiryKeywords = {
    'Pricing Information': ['price', 'cost', 'how much', 'pricing', 'quote', 'estimate'],
    'Service Details': ['service', 'process', 'how do', 'what do you'],
    'Timeline Questions': ['how long', 'turnaround', 'when', 'timeline', 'rush', 'fast'],
    'Shipping Info': ['ship', 'mail', 'send', 'delivery', 'address'],
    'Technical Support': ['problem', 'issue', 'not working', 'error'],
    'Bulk Quote': ['bulk', 'large', 'many', 'hundreds', 'thousands'],
    'Rush Processing': ['rush', 'urgent', 'asap', 'quickly', 'fast', 'express']
  };

  for (const [inquiryType, keywords] of Object.entries(inquiryKeywords)) {
    for (const keyword of keywords) {
      if (fullConversation.includes(keyword)) {
        if (!data.inquiryTypes.includes(inquiryType)) {
          data.inquiryTypes.push(inquiryType);
        }
      }
    }
  }

  // Extract key insights for notes
  const notablePatterns = [
    /(?:i have|we have|there are) (\d+.*?(?:photo|video|slide|tape|reel|negative))/gi,
    /(?:need|want|looking for) (.*?(?:digitiz|transfer|convert))/gi,
    /(?:deadline|need by|required by) (.*)/gi
  ];

  for (const pattern of notablePatterns) {
    const matches = fullConversation.matchAll(pattern);
    for (const match of matches) {
      data.notes.push(match[1].trim());
    }
  }

  return data;
};

const findExistingCustomer = async (email) => {
  if (!base || !email) return null;
  
  try {
    const records = await base(TABLES.CUSTOMERS).select({
      filterByFormula: `{Email} = '${email}'`,
      maxRecords: 1
    }).firstPage();
    
    return records.length > 0 ? records[0] : null;
  } catch (error) {
    console.error('Error finding customer:', error);
    return null;
  }
};

const createProspectRecord = async (extractedData, sessionId) => {
  if (!base || !extractedData.email) return null;
  
  try {
    const prospectData = {
      'Email': extractedData.email,
      'Source': 'Website Chat',
      'Status': 'New Lead'
    };

    if (extractedData.name) prospectData['Name'] = extractedData.name;
    if (extractedData.phone) prospectData['Phone'] = extractedData.phone;
    if (extractedData.mediaTypes.length > 0) prospectData['Media Types'] = extractedData.mediaTypes;
    if (extractedData.inquiryTypes.length > 0) prospectData['Inquiry Type'] = extractedData.inquiryTypes;
    if (extractedData.quantities.length > 0) prospectData['Quantity Mentioned'] = extractedData.quantities.join(', ');
    
    // Create notes from extracted insights
    const notes = [];
    if (extractedData.notes.length > 0) {
      notes.push('Key details from chat:');
      notes.push(...extractedData.notes);
    }
    if (extractedData.mediaTypes.length > 0) {
      notes.push(`Media types mentioned: ${extractedData.mediaTypes.join(', ')}`);
    }
    if (notes.length > 0) {
      prospectData['Notes'] = notes.join('\n');
    }

    const record = await base(TABLES.PROSPECTS).create(prospectData);
    console.log(`✅ PROSPECT - Created new prospect record: ${record.id}`);
    return record;
  } catch (error) {
    console.error('Error creating prospect:', error);
    return null;
  }
};

const saveConversationTranscript = async (sessionId, messages, extractedData) => {
  if (!base || !messages || messages.length === 0) return null;
  
  try {
    // Format conversation transcript
    const metadata = sessionMetadata.get(sessionId) || { startTime: Date.now() };
    const startTime = new Date(metadata.startTime);
    const endTime = new Date();
    
    let transcript = `Conversation: ${startTime.toLocaleDateString()} ${startTime.toLocaleTimeString()} - ${endTime.toLocaleTimeString()}\n`;
    transcript += `Session ID: ${sessionId}\n`;
    if (extractedData.email) {
      transcript += `Customer Email: ${extractedData.email}\n`;
    }
    transcript += '\n';
    
    messages.forEach((msg, index) => {
      const timestamp = new Date(startTime.getTime() + (index * 30000)); // Estimate 30 seconds per message
      const timeStr = timestamp.toLocaleTimeString();
      const speaker = msg.role === 'user' ? 'Customer' : 'HeritageBox AI';
      transcript += `[${timeStr}] ${speaker}: ${msg.content}\n`;
    });
    
    // Add summary
    transcript += '\n--- CONVERSATION SUMMARY ---\n';
    if (extractedData.mediaTypes.length > 0) {
      transcript += `Media Types: ${extractedData.mediaTypes.join(', ')}\n`;
    }
    if (extractedData.inquiryTypes.length > 0) {
      transcript += `Inquiry Types: ${extractedData.inquiryTypes.join(', ')}\n`;
    }
    if (extractedData.quantities.length > 0) {
      transcript += `Quantities: ${extractedData.quantities.join(', ')}\n`;
    }

    // Determine status based on conversation content
    const lastMessage = messages[messages.length - 1];
    const conversationText = messages.map(m => m.content).join(' ').toLowerCase();
    
    let status = 'AI-Handled'; // Default
    if (conversationText.includes('speak to someone') || conversationText.includes('human') || 
        conversationText.includes('representative') || conversationText.includes('agent')) {
      status = 'Needs Human';
    }
    
    const transcriptData = {
      'SessionID': sessionId,
      'Transcript': transcript,
      'Status': status,
      'CustomerEmail': extractedData.email || ''
    };

    const transcriptRecord = await base(TABLES.CHAT_TRANSCRIPTS).create(transcriptData);
    console.log(`✅ TRANSCRIPT - Saved conversation: ${transcriptRecord.id}`);
    
    return transcriptRecord;
  } catch (error) {
    console.error('Error saving transcript:', error);
    return null;
  }
};

const linkTranscriptToCustomerOrProspect = async (transcriptRecord, customerRecord, prospectRecord) => {
  if (!base || !transcriptRecord) return;
  
  try {
    const updates = {};
    
    if (customerRecord) {
      updates['Customer'] = [customerRecord.id];
      console.log(`🔗 TRANSCRIPT - Linked to customer: ${customerRecord.id}`);
    } else if (prospectRecord) {
      updates['Prospects'] = [prospectRecord.id];
      console.log(`🔗 TRANSCRIPT - Linked to prospect: ${prospectRecord.id}`);
    }
    
    if (Object.keys(updates).length > 0) {
      await base(TABLES.CHAT_TRANSCRIPTS).update(transcriptRecord.id, updates);
    }
  } catch (error) {
    console.error('Error linking transcript:', error);
  }
};

const processAndSaveConversation = async (sessionId) => {
  if (!sessions.has(sessionId)) return;
  
  const messages = sessions.get(sessionId);
  if (messages.length < 2) return; // Need at least user message and response
  
  console.log(`💾 SAVING - Processing conversation for session: ${sessionId}`);
  
  try {
    // Extract data from conversation
    const extractedData = extractDataFromConversation(messages);
    
    let customerRecord = null;
    let prospectRecord = null;
    
    // If email was provided, check for existing customer or create prospect
    if (extractedData.email) {
      customerRecord = await findExistingCustomer(extractedData.email);
      
      if (!customerRecord) {
        prospectRecord = await createProspectRecord(extractedData, sessionId);
      }
    }
    
    // Save conversation transcript
    const transcriptRecord = await saveConversationTranscript(sessionId, messages, extractedData);
    
    // Link transcript to customer or prospect
    if (transcriptRecord) {
      await linkTranscriptToCustomerOrProspect(transcriptRecord, customerRecord, prospectRecord);
    }
    
    console.log(`✅ SAVED - Conversation processing complete for session: ${sessionId}`);
  } catch (error) {
    console.error('Error processing conversation:', error);
  }
};

// Cleanup old sessions (run every 30 minutes)
const cleanupOldSessions = () => {
  const now = Date.now();
  const maxAge = 30 * 60 * 1000; // 30 minutes
  
  for (const [sessionId, metadata] of sessionMetadata.entries()) {
    if (now - metadata.startTime > maxAge) {
      // Process and save conversation before cleanup
      processAndSaveConversation(sessionId);
      
      // Clean up session data
      sessions.delete(sessionId);
      sessionMetadata.delete(sessionId);
      console.log(`🧹 CLEANUP - Processed and removed old session: ${sessionId}`);
    }
  }
};

setInterval(cleanupOldSessions, 30 * 60 * 1000); // Run every 30 minutes

// Function to fetch products from Airtable
const fetchProducts = async () => {
  if (!base) {
    console.warn('⚠️ AIRTABLE - Cannot fetch products, using fallback data');
    return null;
  }

  try {
    console.log('📊 AIRTABLE - Fetching current product data...');
    const records = await base(TABLES.PRODUCTS).select({
      sort: [{ field: 'Price', direction: 'asc' }]
    }).all();

    const products = records.map(record => ({
      id: record.id,
      name: record.get('Product Name') || 'Unknown Product',
      description: record.get('Description') || '',
      price: record.get('Price') || 0,
      sku: record.get('SKU') || '',
      stockQuantity: record.get('Stock Quantity') || 0,
      category: record.get('Category') || 'General',
      features: record.get('Features') || ''
    }));

    console.log(`✅ AIRTABLE - Fetched ${products.length} products successfully`);
    return products;
  } catch (error) {
    console.error('❌ AIRTABLE ERROR - Failed to fetch products:', error);
    return null;
  }
};

// Function to get cached or fresh product data
const getProducts = async () => {
  const now = Date.now();
  
  // Check if we have fresh cached data
  if (productsCache && cacheTimestamp && (now - cacheTimestamp) < CACHE_DURATION) {
    console.log('📊 AIRTABLE - Using cached product data');
    return productsCache;
  }

  // Fetch fresh data
  const freshProducts = await fetchProducts();
  if (freshProducts) {
    productsCache = freshProducts;
    cacheTimestamp = now;
    console.log('📊 AIRTABLE - Product cache updated');
    return freshProducts;
  }

  // Return cached data if available, even if stale
  if (productsCache) {
    console.log('⚠️ AIRTABLE - Using stale cached data');
    return productsCache;
  }

  return null;
};

// Function to generate dynamic system prompt with current pricing
const generateSystemPrompt = async () => {
  const products = await getProducts();
  
  let pricingInfo = '';
  if (products && products.length > 0) {
    // Organize products by category for better presentation
    const packages = products.filter(p => p.category === 'Package' || p.name.includes('Package') || 
      p.name.includes('Starter') || p.name.includes('Popular') || p.name.includes('Dusty Rose') || p.name.includes('Eternal'));
    
    const addOns = products.filter(p => p.category === 'Add-on' || p.name.includes('Add-on'));
    const services = products.filter(p => p.category === 'Service' || p.name.includes('Speed'));

    if (packages.length > 0) {
      pricingInfo += '\n📦 CURRENT DIGITIZATION PACKAGES:\n';
      packages.forEach(product => {
        pricingInfo += `- ${product.name}: $${product.price}`;
        if (product.features) {
          pricingInfo += ` (${product.features})`;
        }
        if (product.description && product.description !== product.name) {
          pricingInfo += ` - ${product.description}`;
        }
        pricingInfo += '\n';
      });
    }

    if (addOns.length > 0) {
      pricingInfo += '\n🔧 ADD-ON SERVICES:\n';
      addOns.forEach(product => {
        pricingInfo += `- ${product.name}: $${product.price}`;
        if (product.description) {
          pricingInfo += ` - ${product.description}`;
        }
        pricingInfo += '\n';
      });
    }

    if (services.length > 0) {
      pricingInfo += '\n⚡ SPEED OPTIONS:\n';
      services.forEach(product => {
        pricingInfo += `- ${product.name}: $${product.price}`;
        if (product.description) {
          pricingInfo += ` - ${product.description}`;
        }
        pricingInfo += '\n';
      });
    }

    // Add any remaining products
    const otherProducts = products.filter(p => 
      !packages.includes(p) && !addOns.includes(p) && !services.includes(p));
    if (otherProducts.length > 0) {
      pricingInfo += '\n📋 OTHER SERVICES:\n';
      otherProducts.forEach(product => {
        pricingInfo += `- ${product.name}: $${product.price}`;
        if (product.description) {
          pricingInfo += ` - ${product.description}`;
        }
        pricingInfo += '\n';
      });
    }

    pricingInfo += '\n💡 NOTE: All pricing is current as of today. Packages may include multiple services and bulk discounts.\n';
  } else {
    // Fallback pricing if Airtable is unavailable
    pricingInfo = `
📦 FALLBACK PRICING (Airtable unavailable):
- Standard photos: $0.50 each
- Large photos (8x10+): $1.00 each
- Slides/negatives: $0.75 each
- VHS/VHS-C: $25 per tape
- 8mm/Hi8/Digital8: $30 per tape
- MiniDV: $20 per tape
- Film reels (8mm/16mm): $40-80 per reel

⚠️ Note: Please check our website for most current pricing.
`;
  }

  return `You are a helpful AI assistant for Heritagebox, a professional media digitization company. You help customers with:

- Photo digitization pricing and services
- Video transfer options and pricing  
- Order status inquiries
- Turnaround times and scheduling
- General questions about digitization services

${pricingInfo}

Current turnaround times:
- Standard processing: 2-3 weeks
- Express processing: 1 week (+$50)
- Rush processing: 3-5 days (+$100)
- Large projects may take longer

IMPORTANT INSTRUCTIONS:
- Always use the current pricing information provided above
- When customers ask about packages, explain our main offerings: Starter, Popular, Dusty Rose, and Eternal packages
- Mention that we offer various add-ons like USB drives, online galleries, photo restoration, etc.
- For specific order status, ask for order number, email, or customer details
- Be helpful, professional, and encourage customers to visit our website for full package details

If pricing information seems unavailable, direct customers to check our website or contact us directly for the most current rates.`;
};

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
      sessionMetadata.set(sessionId, { 
        startTime: Date.now(),
        lastActivity: Date.now() 
      });
      console.log(`🆕 SESSION - Started new chat session: ${sessionId}`);
    } else {
      // Update last activity
      const metadata = sessionMetadata.get(sessionId);
      if (metadata) {
        metadata.lastActivity = Date.now();
      }
    }

    const sessionMessages = sessions.get(sessionId);
    
    // Add user message to session
    sessionMessages.push({ role: 'user', content: message });

    // Check if email was provided in this message for immediate processing
    const hasEmail = extractEmailFromMessage(message);
    if (hasEmail) {
      console.log(`📧 EMAIL - Detected email in session ${sessionId}: ${hasEmail}`);
    }

    // Prepare messages for Claude (keep last 10 messages to avoid token limits)
    const recentMessages = sessionMessages.slice(-10);

    console.log(`Processing message for session ${sessionId}: ${message.substring(0, 100)}...`);

    // Generate dynamic system prompt with current Airtable data
    const systemPrompt = await generateSystemPrompt();

    // Call Claude AI
    const response = await anthropic.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 1000,
      system: systemPrompt,
      messages: recentMessages
    });

    const assistantMessage = response.content[0].text;

    // Add assistant response to session
    sessionMessages.push({ role: 'assistant', content: assistantMessage });

    console.log(`Response generated for session ${sessionId}: ${assistantMessage.substring(0, 100)}...`);

    // Process and save conversation if we have enough data
    // Trigger immediate processing if:
    // 1. Email was provided and we have meaningful conversation (4+ messages)
    // 2. Customer asks to speak to someone (ends conversation)
    // 3. Conversation has been going for a while (10+ messages)
    const shouldProcessNow = (
      (hasEmail && sessionMessages.length >= 4) ||
      (message.toLowerCase().includes('speak to someone') || message.toLowerCase().includes('human') || 
       message.toLowerCase().includes('representative') || message.toLowerCase().includes('agent')) ||
      sessionMessages.length >= 10
    );

    if (shouldProcessNow) {
      // Process asynchronously to not delay response
      setTimeout(() => {
        processAndSaveConversation(sessionId);
      }, 1000); // Small delay to ensure response is sent first
    }

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
  sessionMetadata.delete(sessionId);
  res.json({ success: true, message: 'Session cleared' });
});

// Manual conversation processing endpoint (for testing/debugging)
app.post('/process-session/:sessionId', async (req, res) => {
  const { sessionId } = req.params;
  
  if (!sessions.has(sessionId)) {
    return res.status(404).json({ success: false, error: 'Session not found' });
  }

  try {
    await processAndSaveConversation(sessionId);
    res.json({ success: true, message: 'Session processed successfully' });
  } catch (error) {
    console.error('Manual session processing error:', error);
    res.status(500).json({ success: false, error: 'Failed to process session' });
  }
});

// Debug endpoint to view current sessions
app.get('/debug/sessions', (req, res) => {
  const sessionsInfo = Array.from(sessions.entries()).map(([id, messages]) => ({
    sessionId: id,
    messageCount: messages.length,
    metadata: sessionMetadata.get(id),
    lastMessage: messages.length > 0 ? messages[messages.length - 1].content.substring(0, 100) + '...' : 'No messages'
  }));

  res.json({
    activeSessions: sessionsInfo.length,
    sessions: sessionsInfo
  });
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
