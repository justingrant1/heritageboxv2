interface ClaudeMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ClaudeResponse {
  id: string;
  type: string;
  role: string;
  content: Array<{
    type: string;
    text: string;
  }>;
  model: string;
  stop_reason: string;
  stop_sequence: null;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

interface ClaudeError {
  type: string;
  error: {
    type: string;
    message: string;
  };
}

class ClaudeService {
  private apiKey: string;
  private baseUrl = 'https://api.anthropic.com/v1/messages';
  private model = 'claude-3-haiku-20240307';
  private maxRetries = 3;
  private retryDelay = 1000; // ms

  constructor() {
    this.apiKey = import.meta.env.VITE_CLAUDE_API_KEY;
    if (!this.apiKey) {
      throw new Error('Claude API key not found. Please set VITE_CLAUDE_API_KEY in your environment.');
    }
  }

  async sendMessage(
    messages: ClaudeMessage[],
    systemPrompt?: string,
    maxTokens: number = 1024
  ): Promise<string> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        const response = await this.makeRequest(messages, systemPrompt, maxTokens);
        
        if (response.content && response.content.length > 0) {
          return response.content[0].text;
        } else {
          throw new Error('No content in Claude response');
        }
      } catch (error) {
        lastError = error as Error;
        console.warn(`Claude API attempt ${attempt + 1} failed:`, error);
        
        // Don't retry on authentication errors or invalid requests
        if (this.isNonRetryableError(error)) {
          break;
        }

        // Wait before retrying
        if (attempt < this.maxRetries - 1) {
          await this.delay(this.retryDelay * Math.pow(2, attempt));
        }
      }
    }

    throw lastError || new Error('Claude API failed after all retries');
  }

  private async makeRequest(
    messages: ClaudeMessage[],
    systemPrompt?: string,
    maxTokens: number = 1024
  ): Promise<ClaudeResponse> {
    const headers = {
      'Content-Type': 'application/json',
      'x-api-key': this.apiKey,
      'anthropic-version': '2023-06-01'
    };

    const body: any = {
      model: this.model,
      max_tokens: maxTokens,
      messages: messages
    };

    if (systemPrompt) {
      body.system = systemPrompt;
    }

    const response = await fetch(this.baseUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errorData: ClaudeError = await response.json().catch(() => ({
        type: 'api_error',
        error: {
          type: 'unknown_error',
          message: `HTTP ${response.status}: ${response.statusText}`
        }
      }));

      throw new Error(
        errorData.error?.message || `Claude API error: ${response.status} ${response.statusText}`
      );
    }

    return await response.json();
  }

  private isNonRetryableError(error: any): boolean {
    const errorMessage = error.message?.toLowerCase() || '';
    
    // Don't retry authentication errors, permission errors, or invalid request errors
    return (
      errorMessage.includes('authentication') ||
      errorMessage.includes('permission') ||
      errorMessage.includes('invalid') ||
      errorMessage.includes('400') ||
      errorMessage.includes('401') ||
      errorMessage.includes('403')
    );
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Helper method to format conversation history
  formatConversationHistory(chatHistory: Array<{ sender: 'user' | 'bot' | 'human'; message: string }>): ClaudeMessage[] {
    return chatHistory
      .filter(msg => msg.sender === 'user' || msg.sender === 'bot')
      .map(msg => ({
        role: msg.sender === 'user' ? 'user' : 'assistant',
        content: msg.message
      }));
  }

  // Get system prompt for Heritage Box chat
  getSystemPrompt(): string {
    return `You are a helpful customer service assistant for Heritage Box, a premium photo and document digitization service. 

ABOUT HERITAGE BOX:
- We specialize in converting physical photos, documents, and memorabilia into high-quality digital formats
- Our services preserve precious memories for families and individuals
- We offer various packages including photo scanning, document digitization, and restoration services

YOUR ROLE:
- Help customers with questions about our services, pricing, and process
- Assist with order status inquiries (you can look up order information)
- Provide information about our digitization packages and pricing
- Be friendly, professional, and empathetic when discussing customer memories
- If you cannot help with complex issues, offer to connect them with a human agent

IMPORTANT GUIDELINES:
- Always be respectful when discussing customer memories and family history
- Provide accurate information about our services
- If asked about technical specifications, pricing, or order details you're unsure about, say you'll check and offer to connect with a specialist
- Keep responses helpful but concise
- Use a warm, professional tone that reflects the personal nature of our service

If customers need help with order status, ask for their order number or email address to look up their information.`;
  }
}

export default new ClaudeService();
