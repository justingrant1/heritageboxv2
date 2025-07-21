let chatOpen = false;
let sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
let isTyping = false;
let humanHandoff = false;
let pollingInterval = null;
let lastDebugCount = 0;

function addDebugMessage(content) {
    const messagesContainer = document.getElementById('chatMessages');
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message debug';
    
    messageDiv.innerHTML = `<div class="message-content">${content}</div>`;
    
    messagesContainer.appendChild(messageDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function toggleChat() {
    const chatWindow = document.getElementById('chatWindow');
    const chatToggle = document.querySelector('.chat-toggle');
    
    chatOpen = !chatOpen;
    
    if (chatOpen) {
        chatWindow.classList.add('open');
        chatToggle.innerHTML = '✕';
        // Start polling if in human handoff mode
        if (humanHandoff) {
            startPolling();
        }
    } else {
        chatWindow.classList.remove('open');
        chatToggle.innerHTML = '💬';
        // Stop polling when chat is closed
        if (pollingInterval) {
            clearInterval(pollingInterval);
            pollingInterval = null;
        }
    }
}

function startPolling() {
    if (pollingInterval) return; // Already polling
    
    pollingInterval = setInterval(async () => {
        if (!humanHandoff || !chatOpen) {
            clearInterval(pollingInterval);
            pollingInterval = null;
            return;
        }
        
        try {
            const response = await fetch(`/api/chat-messages?sessionId=${encodeURIComponent(sessionId)}`);
            
            const result = await response.json();
            console.log('Polling API response:', result); // Add this for debugging
            
            if (result.success) {
                // Display new agent messages
                if (result.messages && result.messages.length > 0) {
                    const messagesContainer = document.getElementById('chatMessages');
                    const currentMessages = Array.from(messagesContainer.querySelectorAll('.message')).map(msg => msg.dataset.messageId);
                    
                    const newMessages = result.messages.filter(msg => 
                        msg.sender === 'agent' && !currentMessages.includes(msg.id)
                    );
                    
                    console.log(`Found ${newMessages.length} new agent messages.`); // Add this for debugging

                    newMessages.forEach(msg => {
                        addMessage(msg.content, 'agent', msg.id);
                    });
                }

                // Display new debug logs
                if (result.debugLog && result.debugLog.length > lastDebugCount) {
                    const newLogs = result.debugLog.slice(lastDebugCount);
                    newLogs.forEach(log => addDebugMessage(log));
                    lastDebugCount = result.debugLog.length;
                }
            }
        } catch (error) {
            console.error('Error polling for messages:', error);
        }
    }, 2000); // Poll every 2 seconds
}

function handleKeyPress(event) {
    if (event.key === 'Enter') {
        sendMessage();
    }
}

function sendQuickMessage(message) {
    document.getElementById('messageInput').value = message;
    sendMessage();
}

async function sendMessage() {
    const input = document.getElementById('messageInput');
    const message = input.value.trim();
    
    if (!message) return;
    
    // Add user message
    addMessage(message, 'user');
    input.value = '';
    
    // Show typing indicator
    showTyping();
    
    try {
        // Call the real API
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                message,
                sessionId: sessionId,
                conversationHistory: [],
                humanHandoff: humanHandoff
            }),
        });

        const result = await response.json();
        
        hideTyping();
        
        if (result.success) {
            // If in human handoff mode, don't expect an AI response
            if (!humanHandoff) {
                addMessage(result.response, 'bot');
            }
            // If human handoff, the message was stored in session for agents to see
        } else {
            // Fallback response if API fails
            addMessage("I apologize, but I'm experiencing technical difficulties right now. Please try again in a moment or contact our support team directly.", 'bot');
        }
    } catch (error) {
        console.error('Chat error:', error);
        
        hideTyping();
        
        // Fallback to mock response if API is unavailable (only if not in human handoff)
        if (!humanHandoff) {
            let response = getAIResponse(message);
            addMessage(response, 'bot');
        }
    }
}

function addMessage(content, sender, messageId = null) {
    const messagesContainer = document.getElementById('chatMessages');
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${sender}`;
    
    // Add message ID for tracking
    if (messageId) {
        messageDiv.dataset.messageId = messageId;
    } else {
        messageDiv.dataset.messageId = `${sender}_${Date.now()}`;
    }
    
    messageDiv.innerHTML = `
        <div class="message-content">${content}</div>
    `;
    
    messagesContainer.appendChild(messageDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function showTyping() {
    isTyping = true;
    document.getElementById('typingIndicator').style.display = 'block';
    document.getElementById('chatMessages').scrollTop = document.getElementById('chatMessages').scrollHeight;
}

function hideTyping() {
    isTyping = false;
    document.getElementById('typingIndicator').style.display = 'none';
}

async function requestHumanHandoff() {
    humanHandoff = true;
    
    addMessage("Connecting you to a human agent. Please wait a moment...", 'bot');
    
    try {
        const response = await fetch('/api/request-human', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ 
                messages: [], // Could collect previous messages here
                customerInfo: {
                    name: null,
                    email: null,
                    phone: null,
                    timestamp: new Date().toISOString()
                },
                sessionId: sessionId
            }),
        });

        const result = await response.json();

        if (result.success) {
            addMessage("✅ " + result.message + "\n\nA team member has been notified via Slack and will assist you shortly. You can continue chatting here.", 'bot');
            // Start polling for agent responses
            if (chatOpen) {
                startPolling();
            }
        } else {
            addMessage("❌ " + (result.message || result.error || "Unable to connect to human support at this time. Please try contacting us directly at support@heritagebox.com"), 'bot');
            humanHandoff = false; // Reset on error
        }
    } catch (error) {
        console.error('Error requesting human handoff:', error);
        addMessage("❌ Sorry, I was unable to connect you to a human agent at this time. Please try again later or contact us directly at support@heritagebox.com", 'bot');
        humanHandoff = false; // Reset the handoff state on error
    }
}

// Simulated AI responses (in real implementation, this would call Claude API + Airtable)
function getAIResponse(message) {
    const lowerMessage = message.toLowerCase();
    
    if (lowerMessage.includes('photo') || lowerMessage.includes('picture') || lowerMessage.includes('scan')) {
        return `📸 <strong>Photo Digitization Pricing:</strong><br><br>
        • Standard photos: $0.50 each<br>
        • Large photos (8x10+): $1.00 each<br>
        • Slides/negatives: $0.75 each<br>
        • Bulk discounts available for 500+ items<br><br>
        All photos are scanned at 600 DPI with color correction included. Would you like me to create a custom quote for your collection?`;
    }
    
    if (lowerMessage.includes('video') || lowerMessage.includes('tape') || lowerMessage.includes('film')) {
        return `🎬 <strong>Video Transfer Options:</strong><br><br>
        • VHS/VHS-C: $25 per tape<br>
        • 8mm/Hi8/Digital8: $30 per tape<br>
        • MiniDV: $20 per tape<br>
        • Film reels (8mm/16mm): $40-80 per reel<br><br>
        Includes digital cleanup and DVD/digital file delivery. What type of tapes do you have?`;
    }
    
    if (lowerMessage.includes('order') || lowerMessage.includes('status') || lowerMessage.includes('project')) {
        return `📦 I can check your order status! I'll need either:<br><br>
        • Your order number<br>
        • Email address used for the order<br>
        • Last name + phone number<br><br>
        <em>Note: In the real system, I'd instantly access your Airtable database to provide live project updates, estimated completion dates, and tracking information.</em>`;
    }
    
    if (lowerMessage.includes('time') || lowerMessage.includes('how long') || lowerMessage.includes('turnaround')) {
        return `⏱️ <strong>Current Turnaround Times:</strong><br><br>
        • Photos: 5-7 business days<br>
        • Videos: 10-14 business days<br>
        • Large projects (1000+ items): 3-4 weeks<br>
        • Rush service: +50% fee, 2-3 days<br><br>
        These are live estimates based on our current queue. Would you like rush processing?`;
    }
    
    if (lowerMessage.includes('price') || lowerMessage.includes('cost') || lowerMessage.includes('quote')) {
        return `💰 I can provide instant pricing! Tell me more about your project:<br><br>
        • What type of media? (photos, videos, slides, etc.)<br>
        • Approximately how many items?<br>
        • Any special requirements?<br><br>
        I'll calculate a custom quote with our current pricing and any applicable discounts.`;
    }
    
    if (lowerMessage.includes('human') || lowerMessage.includes('agent') || lowerMessage.includes('help')) {
        return `I'd be happy to connect you with a human agent! They can provide personalized assistance with complex questions, custom quotes, and detailed project planning.<br><br>
        <button onclick="requestHumanHandoff()" style="background: linear-gradient(135deg, #667eea, #764ba2); color: white; border: none; padding: 8px 16px; border-radius: 20px; cursor: pointer; margin-top: 10px;">🤝 Talk to Human Agent</button>`;
    }
    
    // Default response
    return `Thanks for your message! I'm here to help with all your media digitization needs. I can assist with:<br><br>
    📸 Photo & slide scanning<br>
    🎬 Video & film transfer<br>
    💰 Pricing & quotes<br>
    📦 Order status & tracking<br>
    ⏱️ Turnaround times<br><br>
    What specific information can I help you with today?`;
}

// Auto-scroll to bottom when new messages arrive
const observer = new MutationObserver(() => {
    const messagesContainer = document.getElementById('chatMessages');
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
});

// Start observing when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    const messagesContainer = document.getElementById('chatMessages');
    if (messagesContainer) {
        observer.observe(messagesContainer, {
            childList: true,
            subtree: true
        });
    }
    
    // Add human handoff button to initial message
    setTimeout(() => {
        const quickActions = document.querySelector('.quick-actions');
        if (quickActions) {
            const humanButton = document.createElement('button');
            humanButton.className = 'quick-action';
            humanButton.textContent = 'Talk to Human';
            humanButton.onclick = requestHumanHandoff;
            quickActions.appendChild(humanButton);
        }
    }, 1000);
});
