export const config = {
    runtime: 'edge',
};

export default async function handler(request: Request) {
    try {
        // Check environment variables
        const squareAccessToken = process.env.SQUARE_ACCESS_TOKEN;
        const SQUARE_LOCATION_ID = process.env.SQUARE_LOCATION_ID;
        const SQUARE_API_URL = process.env.SQUARE_API_URL;

        console.log('Environment check:', {
            hasAccessToken: !!squareAccessToken,
            hasLocationId: !!SQUARE_LOCATION_ID,
            hasApiUrl: !!SQUARE_API_URL,
            accessTokenLength: squareAccessToken?.length,
            locationId: SQUARE_LOCATION_ID,
            apiUrl: SQUARE_API_URL
        });

        // Test simple Square API call (list locations)
        if (squareAccessToken && SQUARE_API_URL) {
            try {
                const testResponse = await fetch(`${SQUARE_API_URL}/v2/locations`, {
                    method: 'GET',
                    headers: {
                        'Square-Version': '2024-02-15',
                        'Authorization': `Bearer ${squareAccessToken}`,
                        'Content-Type': 'application/json',
                    }
                });

                const testResult = await testResponse.json();
                
                console.log('Test API call result:', {
                    status: testResponse.status,
                    ok: testResponse.ok,
                    result: testResult
                });

                return new Response(JSON.stringify({
                    success: true,
                    environmentCheck: {
                        hasAccessToken: !!squareAccessToken,
                        hasLocationId: !!SQUARE_LOCATION_ID,
                        hasApiUrl: !!SQUARE_API_URL,
                        accessTokenLength: squareAccessToken?.length,
                        locationId: SQUARE_LOCATION_ID,
                        apiUrl: SQUARE_API_URL
                    },
                    apiTest: {
                        status: testResponse.status,
                        ok: testResponse.ok,
                        result: testResult
                    }
                }), {
                    status: 200,
                    headers: {'Content-Type': 'application/json'}
                });

            } catch (apiError) {
                console.error('API test error:', apiError);
                return new Response(JSON.stringify({
                    success: false,
                    error: 'API test failed',
                    details: apiError.message
                }), {
                    status: 500,
                    headers: {'Content-Type': 'application/json'}
                });
            }
        }

        return new Response(JSON.stringify({
            success: false,
            error: 'Missing required environment variables',
            environmentCheck: {
                hasAccessToken: !!squareAccessToken,
                hasLocationId: !!SQUARE_LOCATION_ID,
                hasApiUrl: !!SQUARE_API_URL
            }
        }), {
            status: 500,
            headers: {'Content-Type': 'application/json'}
        });

    } catch (error) {
        console.error('Debug endpoint error:', error);
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
