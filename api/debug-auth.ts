export const config = {
    runtime: 'edge',
};

export default async function handler(request: Request) {
    const squareAccessToken = process.env.SQUARE_ACCESS_TOKEN;
    const SQUARE_LOCATION_ID = process.env.SQUARE_LOCATION_ID;
    const SQUARE_API_URL = process.env.SQUARE_API_URL;

    try {
        let debugResults: any[] = [];

        debugResults.push({
            test: 'Environment Variables',
            result: {
                hasAccessToken: !!squareAccessToken,
                tokenPrefix: squareAccessToken?.substring(0, 10) + '...',
                hasLocationId: !!SQUARE_LOCATION_ID,
                locationId: SQUARE_LOCATION_ID,
                hasApiUrl: !!SQUARE_API_URL,
                apiUrl: SQUARE_API_URL,
                nodeEnv: process.env.NODE_ENV
            }
        });

        // Test 1: Simple locations API call (basic auth test)
        console.log('🧪 Test 1: Locations API');
        try {
            const locationsResponse = await fetch(`${SQUARE_API_URL}/v2/locations`, {
                method: 'GET',
                headers: {
                    'Square-Version': '2024-02-15',
                    'Authorization': `Bearer ${squareAccessToken}`,
                    'Content-Type': 'application/json',
                }
            });

            const locationsResult = await locationsResponse.json();
            
            debugResults.push({
                test: 'Locations API Call',
                success: locationsResponse.ok,
                status: locationsResponse.status,
                result: locationsResult,
                headers: Object.fromEntries(locationsResponse.headers.entries())
            });
        } catch (error) {
            debugResults.push({
                test: 'Locations API Call',
                success: false,
                error: error.message
            });
        }

        // Test 2: Simple payment attempt with minimal data
        console.log('🧪 Test 2: Minimal Payment');
        try {
            const testPaymentBody = {
                source_id: 'cnon:card-nonce-ok', // Square test nonce
                amount_money: {
                    amount: 100, // $1.00
                    currency: 'USD'
                },
                location_id: SQUARE_LOCATION_ID,
                idempotency_key: 'test-key-' + Date.now()
            };

            const paymentResponse = await fetch(`${SQUARE_API_URL}/v2/payments`, {
                method: 'POST',
                headers: {
                    'Square-Version': '2024-02-15',
                    'Authorization': `Bearer ${squareAccessToken}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(testPaymentBody)
            });

            const paymentResult = await paymentResponse.json();
            
            debugResults.push({
                test: 'Test Payment Call',
                success: paymentResponse.ok,
                status: paymentResponse.status,
                result: paymentResult,
                requestBody: testPaymentBody
            });
        } catch (error) {
            debugResults.push({
                test: 'Test Payment Call',
                success: false,
                error: error.message
            });
        }

        return new Response(JSON.stringify({
            timestamp: new Date().toISOString(),
            debugResults
        }, null, 2), {
            status: 200,
            headers: {'Content-Type': 'application/json'}
        });

    } catch (error) {
        console.error('Debug auth error:', error);
        return new Response(JSON.stringify({
            success: false,
            error: error.message,
            stack: error.stack
        }, null, 2), {
            status: 500,
            headers: {'Content-Type': 'application/json'}
        });
    }
}
