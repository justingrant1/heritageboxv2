interface ChatMessage {
  id: string;
  content: string;
  sender: 'user' | 'bot';
  timestamp: Date;
}

interface ChatRequest {
  message: string;
  sessionId?: string;
  conversationHistory?: ChatMessage[];
  humanHandoff?: boolean;
}

interface ClaudeMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface VercelRequest {
  method: string;
  body: any;
  url?: string;
  headers: { [key: string]: string | string[] | undefined };
}

interface VercelResponse {
  status(code: number): VercelResponse;
  json(obj: any): VercelResponse;
  setHeader(name: string, value: string): void;
  end(): void;
}

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

// Simple in-memory session storage with metadata
const sessions = new Map();
const sessionMetadata = new Map();

// Cache for product data (refreshed every 5 minutes)
let productsCache: any = null;
let cacheTimestamp: number | null = null;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// Helper function for structured logging
function logEvent(event: string, data: any) {
    console.log(JSON.stringify({
        timestamp: new Date().toISOString(),
        event,
        ...data
    }));
}

// Advanced data extraction functions
const extractEmailFromMessage = (message: string) => {
  const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
  const matches = message.match(emailRegex);
  return matches ? matches[0] : null;
};

const extractDataFromConversation = (messages: ClaudeMessage[]) => {
  const fullConversation = messages.map(m => m.content).join(' ').toLowerCase();
  
  const data = {
    email: null as string | null,
    name: null as string | null,
    phone: null as string | null,
    mediaTypes: [] as string[],
    quantities: [] as string[],
    inquiryTypes: [] as string[],
    notes: [] as string[]
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

// Airtable integration functions
const findExistingCustomer = async (email: string) => {
  if (!AIRTABLE_API_KEY || !email) return null;
  
  try {
    const searchUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${TABLES.CUSTOMERS}?filterByFormula={Email}='${email}'&maxRecords=1`;
    
    const response = await fetch(searchUrl, {
      headers: {
        'Authorization': `Bearer ${AIRTABLE_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) return null;
    
    const data = await response.json();
    return data.records && data.records.length > 0 ? data.records[0] : null;
  } catch (error) {
    console.error('Error finding customer:', error);
    return null;
  }
};

const createProspectRecord = async (extractedData: any, sessionId: string) => {
  if (!AIRTABLE_API_KEY || !extractedData.email) return null;
  
  try {
    const prospectData: any = {
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
    const notes: string[] = [];
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

    const createUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${TABLES.PROSPECTS}`;
    const response = await fetch(createUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${AIRTABLE_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ fields: prospectData })
    });

    if (!response.ok) return null;
    
    const result = await response.json();
    logEvent('prospect_created', { prospectId: result.id, email: extractedData.email });
    return result;
  } catch (error) {
    console.error('Error creating prospect:', error);
    return null;
  }
};

const saveConversationTranscript = async (sessionId: string, messages: ClaudeMessage[], extractedData: any) => {
  if (!AIRTABLE_API_KEY || !messages || messages.length === 0) return null;
  
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

    const createUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${TABLES.CHAT_TRANSCRIPTS}`;
    const response = await fetch(createUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${AIRTABLE_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ fields: transcriptData })
    });

    if (!response.ok) return null;
    
    const result = await response.json();
    logEvent('transcript_saved', { transcriptId: result.id, sessionId });
    return result;
  } catch (error) {
    console.error('Error saving transcript:', error);
    return null;
  }
};

const linkTranscriptToCustomerOrProspect = async (transcriptRecord: any, customerRecord: any, prospectRecord: any) => {
  if (!AIRTABLE_API_KEY || !transcriptRecord) return;
  
  try {
    const updates: any = {};
    
    if (customerRecord) {
      updates['Customer'] = [customerRecord.id];
      logEvent('transcript_linked_customer', { transcriptId: transcriptRecord.id, customerId: customerRecord.id });
    } else if (prospectRecord) {
      updates['Prospects'] = [prospectRecord.id];
      logEvent('transcript_linked_prospect', { transcriptId: transcriptRecord.id, prospectId: prospectRecord.id });
    }
    
    if (Object.keys(updates).length > 0) {
      const updateUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${TABLES.CHAT_TRANSCRIPTS}/${transcriptRecord.id}`;
      await fetch(updateUrl, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${AIRTABLE_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ fields: updates })
      });
    }
  } catch (error) {
    console.error('Error linking transcript:', error);
  }
};

const processAndSaveConversation = async (sessionId: string) => {
  if (!sessions.has(sessionId)) return;
  
  const messages = sessions.get(sessionId);
  if (messages.length < 2) return; // Need at least user message and response
  
  logEvent('conversation_processing_started', { sessionId, messageCount: messages.length });
  
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
    
    logEvent('conversation_processing_completed', { sessionId });
  } catch (error) {
    console.error('Error processing conversation:', error);
  }
};

// Function to fetch products from Airtable
const fetchProducts = async () => {
  if (!AIRTABLE_API_KEY) {
    logEvent('airtable_products_unavailable', { reason: 'No API key' });
    return null;
  }

  try {
    logEvent('fetching_products', { source: 'Airtable' });
    const productsUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${TABLES.PRODUCTS}?sort[0][field]=Price&sort[0][direction]=asc`;
    
    const response = await fetch(productsUrl, {
      headers: {
        'Authorization': `Bearer ${AIRTABLE_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      logEvent('airtable_products_error', { status: response.status });
      return null;
    }

    const data = await response.json();
    const products = data.records.map((record: any) => ({
      id: record.id,
      name: record.fields['Product Name'] || 'Unknown Product',
      description: record.fields['Description'] || '',
      price: record.fields['Price'] || 0,
      sku: record.fields['SKU'] || '',
      stockQuantity: record.fields['Stock Quantity'] || 0,
      category: record.fields['Category'] || 'General',
      features: record.fields['Features'] || ''
    }));

    logEvent('products_fetched', { count: products.length });
    return products;
  } catch (error) {
    console.error('Failed to fetch products:', error);
    return null;
  }
};

// Function to get cached or fresh product data
const getProducts = async () => {
  const now = Date.now();
  
  // Check if we have fresh cached data
  if (productsCache && cacheTimestamp && (now - cacheTimestamp) < CACHE_DURATION) {
    logEvent('products_cache_hit', { cacheAge: now - cacheTimestamp });
    return productsCache;
  }

  // Fetch fresh data
  const freshProducts = await fetchProducts();
  if (freshProducts) {
    productsCache = freshProducts;
    cacheTimestamp = now;
    logEvent('products_cache_updated', { count: freshProducts.length });
    return freshProducts;
  }

  // Return cached data if available, even if stale
  if (productsCache) {
    logEvent('products_cache_stale_used', { cacheAge: now - (cacheTimestamp || 0) });
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
    const packages = products.filter((p: any) => p.category === 'Package' || p.name.includes('Package') || 
      p.name.includes('Starter') || p.name.includes('Popular') || p.name.includes('Dusty Rose') || p.name.includes('Eternal'));
    
    const addOns = products.filter((p: any) => p.category === 'Add-on' || p.name.includes('Add-on'));
    const services = products.filter((p: any) => p.category === 'Service' || p.name.includes('Speed'));

    if (packages.length > 0) {
      pricingInfo += '\n📦 CURRENT DIGITIZATION PACKAGES:\n';
      packages.forEach((product: any) => {
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
      addOns.forEach((product: any) => {
        pricingInfo += `- ${product.name}: $${product.price}`;
        if (product.description) {
          pricingInfo += ` - ${product.description}`;
        }
        pricingInfo += '\n';
      });
    }

    if (services.length > 0) {
      pricingInfo += '\n⚡ SPEED OPTIONS:\n';
      services.forEach((product: any) => {
        pricingInfo += `- ${product.name}: $${product.price}`;
        if (product.description) {
          pricingInfo += ` - ${product.description}`;
        }
        pricingInfo += '\n';
      });
    }

    // Add any remaining products
    const otherProducts = products.filter((p: any) => 
      !packages.includes(p) && !addOns.includes(p) && !services.includes(p));
    if (otherProducts.length > 0) {
      pricingInfo += '\n📋 OTHER SERVICES:\n';
      otherProducts.forEach((product: any) => {
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

  return `You are Helena, the helpful AI assistant for Heritagebox - a professional media digitization service. 

You help customers with:
- Pricing quotes for photo scanning, video transfer, film digitization
- Project status updates and order tracking  
- Service information and turnaround times
- Technical questions about digitization processes

Be friendly, professional, and knowledgeable. Always try to provide specific, helpful information.

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

// Claude AI integration
async function callClaudeAPI(messages: ClaudeMessage[], systemPrompt?: string) {
  const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY;
  
  if (!CLAUDE_API_KEY) {
    logEvent('claude_api_key_missing', { message: 'Claude API key not configured' });
    throw new Error('Claude API key not configured');
  }

  logEvent('claude_api_request', { 
    messageCount: messages.length,
    apiKeyPresent: !!CLAUDE_API_KEY,
    apiKeyLength: CLAUDE_API_KEY.length
  });

  try {
    const requestBody = {
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 1024,
      system: systemPrompt || await generateSystemPrompt(),
      messages: messages
    };

    logEvent('claude_request_body', { 
      model: requestBody.model, 
      systemLength: requestBody.system.length,
      messageCount: requestBody.messages.length 
    });

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': CLAUDE_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(requestBody)
    });

    logEvent('claude_response_received', { 
      status: response.status, 
      statusText: response.statusText,
      ok: response.ok
    });

    if (!response.ok) {
      const errorText = await response.text();
      logEvent('claude_api_error', { 
        status: response.status, 
        statusText: response.statusText,
        errorBody: errorText.substring(0, 500)
      });
      throw new Error(`Claude API error (${response.status}): ${errorText}`);
    }

    const result = await response.json();
    logEvent('claude_response_parsed', { 
      hasContent: !!result.content,
      contentLength: result.content?.[0]?.text?.length || 0
    });

    if (!result.content || !result.content[0] || !result.content[0].text) {
      throw new Error('Invalid response format from Claude API');
    }

    return result.content[0].text;
  } catch (error) {
    logEvent('claude_api_exception', {
      message: error.message,
      name: error.name,
      stack: error.stack?.substring(0, 500)
    });
    throw error;
  }
}

// Legacy order status check (keeping existing functionality)
async function checkOrderStatus(query: string) {
  const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
  const BASE_ID = process.env.AIRTABLE_BASE_ID;
  
  if (!AIRTABLE_API_KEY || !BASE_ID) {
    logEvent('airtable_not_configured', { query: query.substring(0, 50) });
    return null;
  }

  try {
    // Extract potential order number or email from the query
    const emailPattern = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/;
    const orderPattern = /\b(?:order|#)[\s#]*([A-Za-z0-9]+)\b/i;
    
    const emailMatch = query.match(emailPattern);
    const orderMatch = query.match(orderPattern);
    
    let searchUrl = '';
    let searchType = '';
    
    if (emailMatch) {
      // Search by email in Customers table
      const email = emailMatch[0];
      searchUrl = `https://api.airtable.com/v0/${BASE_ID}/tblUS7uf11axEmL56?filterByFormula={Email}='${email}'`;
      searchType = 'email';
      logEvent('airtable_search_by_email', { email });
    } else if (orderMatch) {
      // Search by order number in Orders table
      const orderNum = orderMatch[1];
      searchUrl = `https://api.airtable.com/v0/${BASE_ID}/tblTq25QawVDHTTkV?filterByFormula={Order Number}='${orderNum}'`;
      searchType = 'order';
      logEvent('airtable_search_by_order', { orderNum });
    } else {
      // No clear identifier found
      logEvent('airtable_no_identifier_found', { query: query.substring(0, 100) });
      return {
        found: false,
        message: "I can check your order status! Please provide your order number (like #12345) or the email address you used when placing your order."
      };
    }

    const response = await fetch(searchUrl, {
      headers: {
        'Authorization': `Bearer ${AIRTABLE_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      logEvent('airtable_api_error', { 
        status: response.status, 
        statusText: response.statusText 
      });
      return null;
    }

    const data = await response.json();
    logEvent('airtable_search_result', { 
      recordCount: data.records?.length || 0,
      searchType 
    });

    if (data.records && data.records.length > 0) {
      const record = data.records[0];
      
      if (searchType === 'email') {
        // Found customer, now get their orders
        const customerName = record.fields.Name || 'Valued Customer';
        const email = record.fields.Email;
        
        // Get orders for this customer
        const ordersUrl = `https://api.airtable.com/v0/${BASE_ID}/tblTq25QawVDHTTkV?filterByFormula={Customer}='${record.id}'&sort[0][field]=Order Date&sort[0][direction]=desc`;
        
        const ordersResponse = await fetch(ordersUrl, {
          headers: {
            'Authorization': `Bearer ${AIRTABLE_API_KEY}`,
            'Content-Type': 'application/json'
          }
        });

        if (ordersResponse.ok) {
          const ordersData = await ordersResponse.json();
          if (ordersData.records && ordersData.records.length > 0) {
            const recentOrder = ordersData.records[0];
            const orderNumber = recentOrder.fields['Order Number'];
            const status = recentOrder.fields['Status'] || 'Processing';
            const orderDate = recentOrder.fields['Order Date'];
            
            return {
              found: true,
              message: `Hi ${customerName}! I found your order #${orderNumber} from ${orderDate}. Current status: ${status}`
            };
          }
        }
        
        return {
          found: true,
          message: `Hi ${customerName}! I found your account, but no recent orders. Please contact us if you need assistance.`
        };
      } else if (searchType === 'order') {
        // Found specific order
        const orderNumber = record.fields['Order Number'];
        const status = record.fields['Status'] || 'Processing';
        const orderDate = record.fields['Order Date'];
        
        return {
          found: true,
          message: `Order #${orderNumber} from ${orderDate} - Status: ${status}`
        };
      }
    }

    return {
      found: false,
      message: "I couldn't find that order or email in our system. Please double-check the information or contact us directly."
    };

  } catch (error) {
    logEvent('airtable_search_error', { error: error.message });
    return null;
  }
}

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
      logEvent('session_cleanup', { sessionId });
    }
  }
};

// Run cleanup every 30 minutes
setInterval(cleanupOldSessions, 30 * 60 * 1000);

// Main handler function
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Only allow POST requests for chat
  if (req.method !== 'POST') {
    return res.status(405).json({ 
      success: false, 
      error: 'Method not allowed. Use POST.' 
    });
  }

  try {
    const { message, sessionId } = req.body as ChatRequest;

    if (!message || !sessionId) {
      return res.status(400).json({ 
        success: false, 
        error: 'Message and sessionId are required' 
      });
    }

    logEvent('chat_request_received', { 
      sessionId: sessionId.substring(0, 8) + '...', 
      messageLength: message.length 
    });

    // Get or create session
    if (!sessions.has(sessionId)) {
      sessions.set(sessionId, []);
      sessionMetadata.set(sessionId, { 
        startTime: Date.now(),
        lastActivity: Date.now() 
      });
      logEvent('session_created', { sessionId: sessionId.substring(0, 8) + '...' });
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
      logEvent('email_detected', { 
        sessionId: sessionId.substring(0, 8) + '...', 
        email: hasEmail.substring(0, 3) + '***' 
      });
    }

    // Prepare messages for Claude (keep last 10 messages to avoid token limits)
    const recentMessages = sessionMessages.slice(-10);

    // Check for order status queries first
    const orderStatus = await checkOrderStatus(message);
    if (orderStatus && orderStatus.found) {
      const response = orderStatus.message;
      
      // Add response to session
      sessionMessages.push({ role: 'assistant', content: response });
      
      logEvent('order_status_response', { 
        sessionId: sessionId.substring(0, 8) + '...',
        found: true 
      });

      return res.json({ 
        success: true, 
        response,
        sessionId 
      });
    }

    // Generate dynamic system prompt with current Airtable data
    const systemPrompt = await generateSystemPrompt();

    // Call Claude AI
    const assistantMessage = await callClaudeAPI(recentMessages, systemPrompt);

    // Add assistant response to session
    sessionMessages.push({ role: 'assistant', content: assistantMessage });

    logEvent('claude_response_success', { 
      sessionId: sessionId.substring(0, 8) + '...',
      responseLength: assistantMessage.length 
    });

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

    return res.json({ 
      success: true, 
      response: assistantMessage,
      sessionId 
    });

  } catch (error: any) {
    logEvent('chat_error', { 
      error: error.message,
      stack: error.stack?.substring(0, 500)
    });
    
    let errorMessage = 'I apologize, but I\'m having technical difficulties right now.';
    
    if (error.message?.includes('API key')) {
      errorMessage = 'Configuration issue with AI service. Please contact support.';
    } else if (error.message?.includes('rate limit')) {
      errorMessage = 'Service is temporarily busy. Please try again in a moment.';
    } else if (error.message?.includes('timeout')) {
      errorMessage = 'Request timed out. Please try again.';
    }

    return res.status(500).json({ 
      success: false, 
      error: errorMessage
    });
  }
}
