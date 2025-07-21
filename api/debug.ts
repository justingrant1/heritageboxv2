interface VercelRequest {
  method: string;
  body?: any;
  url?: string;
  headers: { [key: string]: string | string[] | undefined };
}

interface VercelResponse {
  status(code: number): VercelResponse;
  json(obj: any): VercelResponse;
  setHeader(name: string, value: string): void;
  end(): void;
}

// Simple debug endpoint to test API connectivity
export default async function handler(req: VercelRequest, res: VercelResponse) {
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Max-Age', '86400');

    // Handle preflight OPTIONS request
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    const debugInfo: any = {
        timestamp: new Date().toISOString(),
        method: req.method,
        url: req.url,
        headers: req.headers,
        environment: {
            CLAUDE_API_KEY: process.env.CLAUDE_API_KEY ? 'SET (' + process.env.CLAUDE_API_KEY.length + ' chars)' : 'NOT SET',
            AIRTABLE_API_KEY: process.env.AIRTABLE_API_KEY ? 'SET (' + process.env.AIRTABLE_API_KEY.length + ' chars)' : 'NOT SET',
            AIRTABLE_BASE_ID: process.env.AIRTABLE_BASE_ID ? 'SET (' + process.env.AIRTABLE_BASE_ID.length + ' chars)' : 'NOT SET',
            NODE_ENV: process.env.NODE_ENV || 'undefined'
        },
        message: 'Debug endpoint is working! API connectivity successful.',
        success: true
    };

    // Test if we can make a simple request
    try {
        const testResponse = await fetch('https://httpbin.org/json');
        const testData = await testResponse.json();
        debugInfo.networkTest = {
            success: true,
            testUrl: 'https://httpbin.org/json',
            responseReceived: !!testData
        };
    } catch (error: any) {
        debugInfo.networkTest = {
            success: false,
            error: error.message
        };
    }

    return res.status(200).json(debugInfo);
}
