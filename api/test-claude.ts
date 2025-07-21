export const config = {
    runtime: 'edge',
};

export default async function handler(request: Request) {
    if (request.method !== 'POST') {
        return new Response(JSON.stringify({error: 'Method not allowed'}), {
            status: 405,
            headers: {'Content-Type': 'application/json'}
        });
    }

    const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY;
    
    // Check if API key is configured
    if (!CLAUDE_API_KEY) {
        return new Response(JSON.stringify({
            error: 'Claude API key not configured',
            envCheck: {
                hasKey: false,
                keyLength: 0
            }
        }), {
            status: 500,
            headers: {'Content-Type': 'application/json'}
        });
    }

    try {
        const { testMessage = "Hello, this is a test message" } = await request.json();

        console.log('Testing Claude API with key:', CLAUDE_API_KEY.substring(0, 10) + '...');

        const requestBody = {
            model: 'claude-3-5-sonnet-20241022',
            max_tokens: 100,
            system: 'You are Helena, a helpful AI assistant for Heritagebox. Respond briefly and professionally.',
            messages: [{
                role: 'user',
                content: testMessage
            }]
        };

        console.log('Sending request to Claude API...');

        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': CLAUDE_API_KEY,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify(requestBody)
        });

        console.log('Claude API response status:', response.status);

        const responseText = await response.text();
        console.log('Claude API raw response:', responseText.substring(0, 500));

        if (!response.ok) {
            return new Response(JSON.stringify({
                error: 'Claude API error',
                status: response.status,
                statusText: response.statusText,
                response: responseText,
                envCheck: {
                    hasKey: true,
                    keyLength: CLAUDE_API_KEY.length,
                    keyPrefix: CLAUDE_API_KEY.substring(0, 10)
                }
            }), {
                status: 500,
                headers: {'Content-Type': 'application/json'}
            });
        }

        const result = JSON.parse(responseText);

        return new Response(JSON.stringify({
            success: true,
            claudeResponse: result.content?.[0]?.text || 'No text in response',
            fullResponse: result,
            envCheck: {
                hasKey: true,
                keyLength: CLAUDE_API_KEY.length,
                keyPrefix: CLAUDE_API_KEY.substring(0, 10)
            }
        }), {
            status: 200,
            headers: {'Content-Type': 'application/json'}
        });

    } catch (error) {
        console.error('Claude test error:', error);
        
        return new Response(JSON.stringify({
            error: 'Exception during Claude API test',
            message: error.message,
            stack: error.stack?.substring(0, 500),
            envCheck: {
                hasKey: true,
                keyLength: CLAUDE_API_KEY.length,
                keyPrefix: CLAUDE_API_KEY.substring(0, 10)
            }
        }), {
            status: 500,
            headers: {'Content-Type': 'application/json'}
        });
    }
}
