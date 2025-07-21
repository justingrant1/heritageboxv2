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

export default async function handler(req: VercelRequest, res: VercelResponse) {
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Max-Age', '86400');

    // Handle preflight OPTIONS request
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({
            success: false, 
            error: `Method ${req.method} not allowed. Use POST.`
        });
    }

    try {
        const { message } = req.body || {};

        if (!message || message.trim().length === 0) {
            return res.status(400).json({
                success: false, 
                error: 'Message is required'
            });
        }

        // Simple fallback responses without external APIs
        let response = "Thanks for your message! I'm your Heritagebox AI assistant.";
        
        const lowerMessage = message.toLowerCase();
        
        if (lowerMessage.includes('photo') || lowerMessage.includes('picture') || lowerMessage.includes('scan')) {
            response = `📸 **Photo Digitization Pricing:**<br><br>• Standard photos: $0.50 each<br>• Large photos (8x10+): $1.00 each<br>• Slides/negatives: $0.75 each<br>• Bulk discounts available for 500+ items<br><br>All photos are scanned at 600 DPI with color correction included.`;
        } else if (lowerMessage.includes('video') || lowerMessage.includes('tape') || lowerMessage.includes('film')) {
            response = `🎬 **Video Transfer Options:**<br><br>• VHS/VHS-C: $25 per tape<br>• 8mm/Hi8/Digital8: $30 per tape<br>• MiniDV: $20 per tape<br>• Film reels (8mm/16mm): $40-80 per reel<br><br>Includes digital cleanup and DVD/digital file delivery.`;
        } else if (lowerMessage.includes('order') || lowerMessage.includes('status')) {
            response = `📦 I can check your order status! Please provide your order number or email address used for the order.`;
        } else if (lowerMessage.includes('price') || lowerMessage.includes('cost')) {
            response = `💰 I can provide instant pricing! What type of media do you have? (photos, videos, slides, etc.)`;
        }

        return res.status(200).json({
            response,
            sessionId: `session_${Date.now()}`,
            timestamp: new Date().toISOString(),
            success: true
        });

    } catch (error) {
        console.error('Simple chat error:', error);
        
        return res.status(500).json({
            response: "I apologize, but I'm having trouble processing your request right now.",
            error: error.message,
            success: false,
            timestamp: new Date().toISOString()
        });
    }
}
