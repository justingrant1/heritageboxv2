export const config = {
    runtime: 'edge',
};

export default async function handler(request: Request) {
    console.log('=== SQUARE TEST API ===');
    
    if (request.method !== 'GET') {
        return new Response(JSON.stringify({error: 'Method not allowed'}), {
            status: 405,
            headers: {'Content-Type': 'application/json'}
        });
    }

    try {
        const squareAccessToken = process.env.SQUARE_ACCESS_TOKEN;
        const SQUARE_LOCATION_ID = process.env.SQUARE_LOCATION_ID;
        const SQUARE_API_URL = process.env.SQUARE_API_URL;

        console.log('Environment check:', {
            hasAccessToken: !!squareAccessToken,
            hasLocationId: !!SQUARE_LOCATION_ID,
            hasApiUrl: !!SQUARE_API_URL,
            nodeEnv: process.env.NODE_ENV,
            apiUrl: SQUARE_API_URL
        });

        if (!squareAccessToken || !SQUARE_LOCATION_ID || !SQUARE_API_URL) {
            return new Response(JSON.stringify({
                success: false,
                error: 'Missing environment variables',
                config: {
                    hasAccessToken: !!squareAccessToken,
                    hasLocationId: !!SQUARE_LOCATION_ID,
                    hasApiUrl: !!SQUARE_API_URL
                }
            }), {
                status: 500,
                headers: {'Content-Type': 'application/json'}
            });
        }

        // Test 1: Check locations
        console.log('Testing locations endpoint...');
        const locationsResponse = await fetch(`${SQUARE_API_URL}/v2/locations`, {
            method: 'GET',
            headers: {
                'Square-Version': '2024-02-15',
                'Authorization': `Bearer ${squareAccessToken}`,
                'Content-Type': 'application/json',
            }
        });

        const locationsResult = await locationsResponse.json();
        console.log('Locations result:', locationsResult);

        // Test 2: Check catalog items
        console.log('Testing catalog endpoint...');
        const catalogResponse = await fetch(`${SQUARE_API_URL}/v2/catalog/list`, {
            method: 'GET',
            headers: {
                'Square-Version': '2024-02-15',
                'Authorization': `Bearer ${squareAccessToken}`,
                'Content-Type': 'application/json',
            }
        });

        const catalogResult = await catalogResponse.json();
        console.log('Catalog result:', catalogResult);

        // Test 3: Try to create a simple test payment (with invalid token to test API connection)
        console.log('Testing payments endpoint...');
        const paymentResponse = await fetch(`${SQUARE_API_URL}/v2/payments`, {
            method: 'POST',
            headers: {
                'Square-Version': '2024-02-15',
                'Authorization': `Bearer ${squareAccessToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                source_id: 'test-token',
                amount_money: {
                    amount: 100,
                    currency: 'USD'
                },
                location_id: SQUARE_LOCATION_ID,
                idempotency_key: crypto.randomUUID()
            })
        });

        const paymentResult = await paymentResponse.json();
        console.log('Payment test result:', paymentResult);

        return new Response(JSON.stringify({
            success: true,
            tests: {
                locations: {
                    status: locationsResponse.status,
                    ok: locationsResponse.ok,
                    result: locationsResult
                },
                catalog: {
                    status: catalogResponse.status,
                    ok: catalogResponse.ok,
                    result: catalogResult
                },
                payment: {
                    status: paymentResponse.status,
                    ok: paymentResponse.ok,
                    result: paymentResult
                }
            }
        }), {
            status: 200,
            headers: {'Content-Type': 'application/json'}
        });

    } catch (error) {
        console.error('Test error:', error);
        return new Response(JSON.stringify({
            success: false,
            error: error.message,
            stack: error.stack
        }), {
            status: 500,
            headers: {'Content-Type': 'application/json'}
        });
    }
}
