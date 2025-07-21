export const config = {
    runtime: 'edge',
};

export default async function handler(request: Request) {
    const squareAccessToken = process.env.SQUARE_ACCESS_TOKEN;
    const SQUARE_LOCATION_ID = process.env.SQUARE_LOCATION_ID;
    const SQUARE_API_URL = process.env.SQUARE_API_URL;

    try {
        // Test order creation with Starter package
        const orderBody = {
            order: {
                location_id: SQUARE_LOCATION_ID,
                line_items: [{
                    quantity: "1",
                    catalog_object_id: "GNQP4YZH57MGVR265N4QA7QH" // Starter package
                }]
            }
        };

        console.log('Testing order creation with body:', JSON.stringify(orderBody, null, 2));

        const createOrderResponse = await fetch(`${SQUARE_API_URL}/v2/orders`, {
            method: 'POST',
            headers: {
                'Square-Version': '2024-02-15',
                'Authorization': `Bearer ${squareAccessToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(orderBody)
        });

        const orderResult = await createOrderResponse.json();
        
        console.log('Order creation response:', {
            status: createOrderResponse.status,
            ok: createOrderResponse.ok,
            result: orderResult
        });

        return new Response(JSON.stringify({
            success: createOrderResponse.ok,
            status: createOrderResponse.status,
            orderResult: orderResult,
            testOrderBody: orderBody,
            environment: {
                hasAccessToken: !!squareAccessToken,
                hasLocationId: !!SQUARE_LOCATION_ID,
                hasApiUrl: !!SQUARE_API_URL,
                apiUrl: SQUARE_API_URL
            }
        }, null, 2), {
            status: 200,
            headers: {'Content-Type': 'application/json'}
        });
    } catch (error) {
        console.error('Debug payment error:', error);
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
