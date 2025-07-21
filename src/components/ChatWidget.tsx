import React, { useState, useRef, useEffect } from 'react';
import openaiService from '../services/openaiService';
import airtableService from '../services/airtableService';

interface Message {
  id: string;
  content: string;
  sender: 'user' | 'bot' | 'human';
  timestamp: Date;
}

interface ChatHistory {
  sender: 'user' | 'bot' | 'human';
  message: string;
}

const ChatWidget: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      content: `Hi! I'm your Heritagebox AI assistant. I can help you with:
      
📸 Photo digitization pricing
🎬 Video transfer options  
📦 Project status updates
⏱️ Turnaround times

What would you like to know?`,
      sender: 'bot',
      timestamp: new Date()
    }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [humanHandoff, setHumanHandoff] = useState(false);
  const [sessionId] = useState<string>(() => `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`);
  const [pollingInterval, setPollingInterval] = useState<NodeJS.Timeout | null>(null);
  const [lastPolledMessageId, setLastPolledMessageId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Polling effect to check for new messages from Slack
  useEffect(() => {
    if (humanHandoff && sessionId && isOpen) {
      console.log('🔄 Starting message polling...', { sessionId, humanHandoff, isOpen });
      
      const interval = setInterval(async () => {
        try {
          console.log('📡 Polling for new messages...', { sessionId });
          const response = await fetch(`/api/chat-messages?sessionId=${encodeURIComponent(sessionId)}`);
          
          const result = await response.json();
          console.log('📨 Polling response:', result);
          
          if (result.success && result.messages && result.messages.length > 0) {
            // Get current message IDs to avoid duplicates
            setMessages(currentMessages => {
              const currentMessageIds = currentMessages.map(m => m.id);
              const newMessages = result.messages.filter((msg: any) => 
                !currentMessageIds.includes(msg.id) && msg.sender === 'agent'
              );
              
              console.log('🆕 Found new messages:', newMessages.length, newMessages);
              
              if (newMessages.length > 0) {
                // Add new messages from agents
                const formattedNewMessages: Message[] = newMessages.map((msg: any) => ({
                  id: msg.id,
                  content: msg.content,
                  sender: 'bot', // Display agent messages as bot messages in the UI
                  timestamp: new Date(msg.timestamp)
                }));
                
                console.log('✅ Adding agent messages to chat:', formattedNewMessages);
                return [...currentMessages, ...formattedNewMessages];
              }
              
              return currentMessages;
            });
          }
        } catch (error) {
          console.error('❌ Error polling for messages:', error);
        }
      }, 2000); // Poll every 2 seconds for better responsiveness
      
      setPollingInterval(interval);
      
      return () => {
        console.log('🛑 Stopping message polling...');
        if (interval) clearInterval(interval);
      };
    } else {
      console.log('⏸️ Polling not started:', { humanHandoff, sessionId, isOpen });
    }
  }, [humanHandoff, sessionId, isOpen]); // Removed 'messages' dependency to prevent interval recreation

  // Cleanup polling when component unmounts or chat closes
  useEffect(() => {
    if (!isOpen && pollingInterval) {
      clearInterval(pollingInterval);
      setPollingInterval(null);
    }
  }, [isOpen, pollingInterval]);

  const sendMessage = async (message: string) => {
    if (!message.trim()) return;

    // Add user message
    const userMessage: Message = {
      id: `user_${Date.now()}`,
      content: message,
      sender: 'user',
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsTyping(true);

    try {
      if (humanHandoff) {
        // Route to Slack when in human handoff mode
        console.log('🔄 Sending message to Slack thread...', { sessionId, message: message.substring(0, 50) });
        
        const response = await fetch('/api/send-to-slack', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            sessionId: sessionId,
            message: message,
            sender: 'user'
          }),
        });

        if (!response.ok) {
          const responseText = await response.text();
          console.error('Slack API Error Response:', responseText);
          throw new Error(`Failed to send to Slack: ${response.status} - ${responseText.substring(0, 200)}`);
        }

        const result = await response.json();
        
        if (result.success) {
          console.log('✅ Message sent to Slack successfully', { messageId: result.messageId });
          // No bot response needed - human agents will respond via Slack
        } else {
          throw new Error(result.error || 'Failed to send message to Slack');
        }

      } else {
        // Use OpenAI directly for AI responses
        console.log('🤖 Processing message with OpenAI...');
        
        // Check if this looks like an order lookup request
        if (await isOrderLookupRequest(message)) {
          await handleOrderLookup(message);
        } else {
          // Regular AI conversation
          await handleOpenAIConversation(message);
        }
      }
    } catch (error) {
      console.error('Chat error:', error);
      
      // Show appropriate error based on mode
      const errorResponse: Message = {
        id: `bot_${Date.now()}`,
        content: humanHandoff 
          ? `❌ **Unable to send message to support team**<br><br>There was a problem forwarding your message. Please try again or contact us directly at support@heritagebox.com<br><br>**Error:** ${(error as Error).message}`
          : `❌ **Connection Error**<br><br>I'm having trouble processing your request right now. This could be due to:<br><br>• Network connectivity issues<br>• AI service temporarily unavailable<br>• Configuration problems<br><br>**Error details:** ${(error as Error).message}<br><br>Please try again in a moment or contact support@heritagebox.com if this persists.`,
        sender: 'bot',
        timestamp: new Date()
      };
      
      setMessages(prev => [...prev, errorResponse]);
    } finally {
      setIsTyping(false);
    }
  };

  // Check if the message is requesting order information
  const isOrderLookupRequest = async (message: string): Promise<boolean> => {
    const lowerMessage = message.toLowerCase();
    
    // Look for order-related keywords and potential identifiers
    const orderKeywords = ['order', 'status', 'track', 'lookup', 'find', 'check'];
    const hasOrderKeyword = orderKeywords.some(keyword => lowerMessage.includes(keyword));
    
    // Look for email patterns or order number patterns
    const emailPattern = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/;
    const orderNumberPattern = /\b[A-Z0-9]{6,20}\b/;
    const hasIdentifier = emailPattern.test(message) || orderNumberPattern.test(message);
    
    return hasOrderKeyword || hasIdentifier;
  };

  // Handle order lookup requests
  const handleOrderLookup = async (message: string) => {
    try {
      // Extract potential identifiers from the message
      const emailPattern = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/;
      const orderNumberPattern = /\b[A-Z0-9-]{6,20}\b/;
      
      const emailMatch = message.match(emailPattern);
      const orderNumberMatch = message.match(orderNumberPattern);
      
      let identifier = '';
      if (orderNumberMatch) {
        identifier = orderNumberMatch[0];
      } else if (emailMatch) {
        identifier = emailMatch[0];
      }

      if (identifier) {
        console.log('🔍 Looking up order for:', identifier);
        
        const lookupResult = await airtableService.lookupCustomerOrders(identifier);
        
        let responseContent = '';
        
        if (lookupResult.customer && lookupResult.orders.length > 0) {
          // Found orders - format the response nicely
          responseContent = `✅ **Order Information Found**\n\n`;
          responseContent += airtableService.formatCustomerOrders(lookupResult.customer, lookupResult.orders);
          
          if (lookupResult.orders.length === 1) {
            responseContent += '\n\nIs there anything specific about this order you\'d like to know more about?';
          } else {
            responseContent += '\n\nWould you like me to provide more details about any of these orders?';
          }
        } else {
          // No orders found
          responseContent = lookupResult.message + '\n\n';
          responseContent += 'If you\'d like me to help you find your order, please provide:\n';
          responseContent += '• Your order number (if you have it)\n';
          responseContent += '• The email address used for the order\n';
          responseContent += '• Or I can connect you with a human agent who can help';
        }

        const botResponse: Message = {
          id: `bot_${Date.now()}`,
          content: responseContent,
          sender: 'bot',
          timestamp: new Date()
        };
        
        setMessages(prev => [...prev, botResponse]);
      } else {
        // No identifier found, ask for one
        const botResponse: Message = {
          id: `bot_${Date.now()}`,
          content: `📦 I'd be happy to help you check your order status! 

To look up your order, I'll need either:
• Your order number (usually starts with letters/numbers like HB-2024-001)
• The email address you used when placing the order

Please share whichever one you have, and I'll find your order information right away!`,
          sender: 'bot',
          timestamp: new Date()
        };
        
        setMessages(prev => [...prev, botResponse]);
      }
    } catch (error) {
      console.error('Error in order lookup:', error);
      
      const botResponse: Message = {
        id: `bot_${Date.now()}`,
        content: `❌ I encountered an issue while looking up your order information. Please try again or I can connect you with a human agent who can help you directly.

You can also contact our support team at support@heritagebox.com with your order details.`,
        sender: 'bot',
        timestamp: new Date()
      };
      
      setMessages(prev => [...prev, botResponse]);
    }
  };

  // Handle regular OpenAI conversations
  const handleOpenAIConversation = async (message: string) => {
    try {
      // Get conversation history for context
      const conversationHistory: ChatHistory[] = messages.map(msg => ({
        sender: msg.sender,
        message: msg.content
      }));

      // Add the current user message
      conversationHistory.push({
        sender: 'user',
        message: message
      });

      // Format for OpenAI API
      const openaiMessages = openaiService.formatConversationHistory(conversationHistory);
      
      // Get enhanced system prompt with current pricing if needed
      let systemPrompt = openaiService.getSystemPrompt();
      
      // If the message is about pricing, add current package pricing to context
      if (message.toLowerCase().includes('price') || message.toLowerCase().includes('cost') || message.toLowerCase().includes('package')) {
        try {
          const packagePricing = await airtableService.getPackagePricing();
          systemPrompt += '\n\nCURRENT PACKAGE PRICING:\n';
          Object.entries(packagePricing).forEach(([pkg, price]) => {
            systemPrompt += `• ${pkg}: $${price}\n`;
          });
        } catch (error) {
          console.warn('Could not fetch current pricing:', error);
        }
      }

      // Send to OpenAI
      const openaiResponse = await openaiService.sendMessage(
        openaiMessages,
        systemPrompt,
        1024
      );

      const botResponse: Message = {
        id: `bot_${Date.now()}`,
        content: openaiResponse,
        sender: 'bot',
        timestamp: new Date()
      };
      
      setMessages(prev => [...prev, botResponse]);
      
    } catch (error) {
      console.error('Error in OpenAI conversation:', error);
      
      const botResponse: Message = {
        id: `bot_${Date.now()}`,
        content: `I apologize, but I'm having trouble processing your request right now. This could be due to a temporary issue with our AI service.

Please try again in a moment, or I can connect you with a human agent who can assist you directly.

**Error:** ${(error as Error).message}`,
        sender: 'bot',
        timestamp: new Date()
      };
      
      setMessages(prev => [...prev, botResponse]);
    }
  };

  const getAIResponse = (message: string): string => {
    const lowerMessage = message.toLowerCase();
    
    if (lowerMessage.includes('photo') || lowerMessage.includes('picture') || lowerMessage.includes('scan')) {
      return `📸 **Photo Digitization Pricing:**

• Standard photos: $0.50 each
• Large photos (8x10+): $1.00 each  
• Slides/negatives: $0.75 each
• Bulk discounts available for 500+ items

All photos are scanned at 600 DPI with color correction included. Would you like me to create a custom quote for your collection?`;
    }
    
    if (lowerMessage.includes('video') || lowerMessage.includes('tape') || lowerMessage.includes('film')) {
      return `🎬 **Video Transfer Options:**

• VHS/VHS-C: $25 per tape
• 8mm/Hi8/Digital8: $30 per tape
• MiniDV: $20 per tape  
• Film reels (8mm/16mm): $40-80 per reel

Includes digital cleanup and DVD/digital file delivery. What type of tapes do you have?`;
    }
    
    if (lowerMessage.includes('order') || lowerMessage.includes('status') || lowerMessage.includes('project')) {
      return `📦 I can check your order status! I'll need either:

• Your order number
• Email address used for the order
• Last name + phone number

*Note: In the full system, I'd instantly access your Airtable database to provide live project updates, estimated completion dates, and tracking information.*`;
    }
    
    if (lowerMessage.includes('time') || lowerMessage.includes('how long') || lowerMessage.includes('turnaround')) {
      return `⏱️ **Current Turnaround Times:**

• Photos: 5-7 business days
• Videos: 10-14 business days  
• Large projects (1000+ items): 3-4 weeks
• Rush service: +50% fee, 2-3 days

These are live estimates based on our current queue. Would you like rush processing?`;
    }
    
    if (lowerMessage.includes('price') || lowerMessage.includes('cost') || lowerMessage.includes('quote')) {
      return `💰 I can provide instant pricing! Tell me more about your project:

• What type of media? (photos, videos, slides, etc.)
• Approximately how many items?
• Any special requirements?

I'll calculate a custom quote with our current pricing and any applicable discounts.`;
    }
    
    // Default response
    return `Thanks for your message! I'm here to help with all your media digitization needs. I can assist with:

📸 Photo & slide scanning
🎬 Video & film transfer  
💰 Pricing & quotes
📦 Order status & tracking
⏱️ Turnaround times

What specific information can I help you with today?`;
  };

  const sendQuickMessage = (message: string) => {
    sendMessage(message);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      sendMessage(inputValue);
    }
  };

  const requestHumanHandoff = async () => {
    setHumanHandoff(true);
    const handoffMessage: Message = {
      id: Date.now().toString(),
      content: "Connecting you to a human agent. Please wait a moment...",
      sender: 'bot',
      timestamp: new Date()
    };
    setMessages(prev => [...prev, handoffMessage]);

    try {
      // Format messages for the API
      const formattedMessages = messages.map(msg => ({
        sender: msg.sender,
        content: msg.content,
        timestamp: msg.timestamp.toISOString()
      }));

      // You could collect customer info from a form or previous conversation
      // For now, we'll use basic info that might be available
      const customerInfo = {
        name: null, // Could be collected from a form
        email: null, // Could be collected from a form  
        phone: null, // Could be collected from a form
        timestamp: new Date().toISOString()
      };

      const response = await fetch('/api/request-human', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          messages: formattedMessages,
          customerInfo,
          sessionId: sessionId
        }),
      });

      const result = await response.json();

      if (result.success) {
        // Session ID is already set and consistent
        const successMessage: Message = {
          id: (Date.now() + 1).toString(),
          content: "✅ " + result.message + "\n\nA team member has been notified and will assist you shortly. You can continue chatting here or expect a call/email if you provided contact details.",
          sender: 'bot',
          timestamp: new Date()
        };
        setMessages(prev => [...prev, successMessage]);
      } else {
        const errorMessage: Message = {
          id: (Date.now() + 1).toString(),
          content: "❌ " + (result.message || result.error || "Unable to connect to human support at this time. Please try contacting us directly at support@heritagebox.com"),
          sender: 'bot',
          timestamp: new Date()
        };
        setMessages(prev => [...prev, errorMessage]);
      }
    } catch (error) {
      console.error('Error requesting human handoff:', error);
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: "❌ Sorry, I was unable to connect you to a human agent at this time. Please try again later or contact us directly at info@heritagebox.com",
        sender: 'bot',
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
      setHumanHandoff(false); // Reset the handoff state on error
    }
  };

  return (
    <div className="fixed bottom-5 right-5 z-50">
      {/* Chat Toggle Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-15 h-15 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 text-white text-2xl shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1 flex items-center justify-center"
        style={{ width: '60px', height: '60px' }}
      >
        {isOpen ? '✕' : '💬'}
      </button>

      {/* Chat Window */}
      {isOpen && (
        <div className="absolute bottom-20 right-0 w-96 h-[550px] bg-white rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom-5 duration-300 max-sm:w-[calc(100vw-40px)] max-sm:right-[-10px]">
          {/* Header */}
          <div className="bg-gradient-to-r from-blue-500 to-purple-600 text-white p-5 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center text-lg">
                🎞️
              </div>
              <div>
                <h3 className="font-semibold">Heritagebox Assistant</h3>
                <p className="text-sm opacity-90">Here to help with your digitization needs</p>
              </div>
            </div>
            <button
              onClick={requestHumanHandoff}
              disabled={humanHandoff}
              className="text-xs bg-white/20 hover:bg-white/30 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-1 px-3 rounded-full transition-colors"
            >
              Talk to Human
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 p-5 overflow-y-auto bg-gray-50">
            {messages.map((message) => (
              <div key={message.id} className="mb-4">
                <div
                  className={`max-w-[85%] p-3 rounded-2xl ${
                    message.sender === 'user'
                      ? 'bg-gradient-to-r from-blue-500 to-purple-600 text-white ml-auto rounded-br-sm'
                      : 'bg-white text-gray-800 shadow-sm rounded-bl-sm'
                  }`}
                  dangerouslySetInnerHTML={{ 
                    __html: message.content.replace(/\n/g, '<br>').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') 
                  }}
                />
              </div>
            ))}

            {/* Quick Actions - only show after first message */}
            {messages.length === 1 && (
              <div className="flex flex-wrap gap-2 mt-3">
                <button
                  onClick={() => sendQuickMessage('How much does photo scanning cost?')}
                  className="px-3 py-2 bg-blue-100 text-blue-600 rounded-full text-xs hover:bg-blue-200 transition-colors"
                >
                  Photo Pricing
                </button>
                <button
                  onClick={() => sendQuickMessage('Check my order status')}
                  className="px-3 py-2 bg-blue-100 text-blue-600 rounded-full text-xs hover:bg-blue-200 transition-colors"
                >
                  Order Status
                </button>
                <button
                  onClick={() => sendQuickMessage('Video transfer options')}
                  className="px-3 py-2 bg-blue-100 text-blue-600 rounded-full text-xs hover:bg-blue-200 transition-colors"
                >
                  Video Transfer
                </button>
              </div>
            )}

            {/* Typing Indicator */}
            {isTyping && (
              <div className="max-w-[85%] p-3 rounded-2xl bg-white shadow-sm rounded-bl-sm">
                <div className="flex gap-1">
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: '0.2s'}}></div>
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: '0.4s'}}></div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="p-5 bg-white border-t">
            <div className="flex gap-3 items-center">
              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Type your message..."
                className="flex-1 p-3 border-2 border-gray-200 rounded-full focus:border-blue-500 focus:outline-none text-sm"
              />
              <button
                onClick={() => sendMessage(inputValue)}
                disabled={!inputValue.trim() || isTyping}
                className="w-10 h-10 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-full flex items-center justify-center hover:scale-110 transition-transform disabled:opacity-50 disabled:hover:scale-100"
              >
                ➤
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default ChatWidget;
