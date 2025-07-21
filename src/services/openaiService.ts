interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface OpenAIResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

interface OpenAIError {
  error: {
    message: string;
    type: string;
    code?: string;
  };
}

class OpenAIService {
  private apiKey: string;
  private baseUrl = 'https://api.openai.com/v1/chat/completions';
  private model = 'gpt-3.5-turbo';
  private maxRetries = 3;
  private retryDelay = 1000; // ms

  constructor() {
    this.apiKey = import.meta.env.VITE_OPENAI_API_KEY;
    if (!this.apiKey) {
      throw new Error('OpenAI API key not found. Please set VITE_OPENAI_API_KEY in your environment.');
    }
  }

  async sendMessage(
    messages: OpenAIMessage[],
    systemPrompt?: string,
    maxTokens: number = 1024
  ): Promise<string> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        const response = await this.makeRequest(messages, systemPrompt, maxTokens);
        
        if (response.choices && response.choices.length > 0 && response.choices[0].message) {
          return response.choices[0].message.content;
        } else {
          throw new Error('No content in OpenAI response');
        }
      } catch (error) {
        lastError = error as Error;
        console.warn(`OpenAI API attempt ${attempt + 1} failed:`, error);
        
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

    throw lastError || new Error('OpenAI API failed after all retries');
  }

  private async makeRequest(
    messages: OpenAIMessage[],
    systemPrompt?: string,
    maxTokens: number = 1024
  ): Promise<OpenAIResponse> {
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.apiKey}`
    };

    // Prepare messages array
    const chatMessages: OpenAIMessage[] = [];
    
    // Add system prompt if provided
    if (systemPrompt) {
      chatMessages.push({
        role: 'system',
        content: systemPrompt
      });
    }

    // Add conversation messages
    chatMessages.push(...messages);

    const body = {
      model: this.model,
      messages: chatMessages,
      max_tokens: maxTokens,
      temperature: 0.7,
      top_p: 1,
      frequency_penalty: 0,
      presence_penalty: 0
    };

    const response = await fetch(this.baseUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errorData: OpenAIError = await response.json().catch(() => ({
        error: {
          type: 'api_error',
          message: `HTTP ${response.status}: ${response.statusText}`
        }
      }));

      throw new Error(
        errorData.error?.message || `OpenAI API error: ${response.status} ${response.statusText}`
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
      errorMessage.includes('403') ||
      errorMessage.includes('invalid_api_key') ||
      errorMessage.includes('unauthorized')
    );
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Helper method to format conversation history
  formatConversationHistory(chatHistory: Array<{ sender: 'user' | 'bot' | 'human'; message: string }>): OpenAIMessage[] {
    return chatHistory
      .filter(msg => msg.sender === 'user' || msg.sender === 'bot')
      .map(msg => ({
        role: msg.sender === 'user' ? 'user' : 'assistant',
        content: msg.message
      }));
  }

  // Get system prompt for Heritage Box chat (optimized for OpenAI)
  getSystemPrompt(): string {
    return `You are a helpful and knowledgeable customer service assistant for Heritage Box, a premium photo and document digitization service.

ABOUT HERITAGE BOX:
- We specialize in converting physical photos, documents, and memorabilia into high-quality digital formats
- Our mission is to preserve precious memories for families and individuals
- We offer various packages including photo scanning, document digitization, and restoration services

YOUR ROLE & RESPONSIBILITIES:
- Help customers with questions about our services, pricing, and digitization process
- Assist with order status inquiries (you have access to order lookup functionality)
- Provide accurate information about our digitization packages and pricing
- Be friendly, professional, and empathetic when discussing customer memories and family history
- If you cannot help with complex technical issues, offer to connect them with a human specialist

COMMUNICATION GUIDELINES:
- Always be respectful and understanding when discussing customer memories and family history
- Provide accurate, helpful information about our services
- Keep responses conversational but professional
- If asked about specific technical specifications, pricing, or order details you're unsure about, acknowledge this and offer to connect with a specialist
- Use a warm, friendly tone that reflects the personal and emotional nature of our digitization service
- Be concise but thorough in your responses

ORDER ASSISTANCE:
- For order status inquiries, ask for the customer's order number or email address
- You can look up order information to provide real-time updates
- Always offer additional assistance after providing order information

Remember: You're helping people preserve their most treasured memories, so approach every interaction with care and professionalism.`;
  }
}

export default new OpenAIService();
