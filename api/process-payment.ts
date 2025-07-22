
// Simplified payment processing for development environment
export default async function handler(request: Request) {
    try {
        console.log('🔄 Payment request received:', request.method, request.url);

        if (request.method !== 'POST') {
            return new Response(JSON.stringify({success: false, error: 'Method not allowed'}), {
                status: 405,
                headers: {'Content-Type': 'application/json'}
            });
        }

        const body = await request.json();
        const {token, amount, orderDetails} = body;

        console.log('📝 Payment data:', {
            hasToken: !!token,
            amount: amount,
            hasOrderDetails: !!orderDetails,
            body: body
        });

        if (!token || !amount) {
            console.log('❌ Missing required fields');
            return new Response(JSON.stringify({success: false, error: 'Missing required fields'}), {
                status: 400,
                headers: {'Content-Type': 'application/json'}
            });
        }

        // Environment variables
        const squareAccessToken = process.env.SQUARE_ACCESS_TOKEN;
        const SQUARE_LOCATION_ID = process.env.SQUARE_LOCATION_ID;
        const SQUARE_API_URL = process.env.SQUARE_API_URL;

        console.log('🔧 Environment check:', {
            hasAccessToken: !!squareAccessToken,
            accessTokenStart: squareAccessToken?.substring(0, 10),
            hasLocationId: !!SQUARE_LOCATION_ID,
            locationId: SQUARE_LOCATION_ID,
            hasApiUrl: !!SQUARE_API_URL,
            apiUrl: SQUARE_API_URL
        });

        if (!squareAccessToken || !SQUARE_LOCATION_ID || !SQUARE_API_URL) {
            console.log('❌ Missing environment variables');
            return new Response(JSON.stringify({
                success: false, 
                error: 'Payment service not configured properly',
                debug: {
                    hasAccessToken: !!squareAccessToken,
                    hasLocationId: !!SQUARE_LOCATION_ID,
                    hasApiUrl: !!SQUARE_API_URL
                }
            }), {
                status: 500,
                headers: {'Content-Type': 'application/json'}
            });
        }

        // Generate simple idempotency key
        const idempotencyKey = `hb-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
        
        // Create payment body
        const paymentBody = {
            source_id: token,
            amount_money: {
                amount: Math.round(amount * 100), // Convert to cents
                currency: 'USD'
            },
            location_id: SQUARE_LOCATION_ID,
            idempotency_key: idempotencyKey,
            note: orderDetails ? `${orderDetails.package} Package` : 'Heritage Box Order',
            autocomplete: true
        };

        console.log('💰 Sending payment to Square:', {
            amount: paymentBody.amount_money.amount,
            locationId: paymentBody.location_id,
            endpoint: `${SQUARE_API_URL}/v2/payments`,
            paymentBody: paymentBody
        });

        // Make Square API call
        const response = await fetch(`${SQUARE_API_URL}/v2/payments`, {
            method: 'POST',
            headers: {
                'Square-Version': '2024-02-15',
                'Authorization': `Bearer ${squareAccessToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(paymentBody)
        });

        const result = await response.json();
        
        console.log('📦 Square response:', {
            status: response.status,
            ok: response.ok,
            hasPayment: !!result.payment,
            paymentId: result.payment?.id,
            paymentStatus: result.payment?.status,
            hasErrors: !!result.errors,
            errors: result.errors
        });

        if (!response.ok) {
            console.log('❌ Square API error:', result.errors);
            const errorMessage = result.errors?.[0]?.detail || result.errors?.[0]?.code || 'Payment failed';
            return new Response(JSON.stringify({
                success: false, 
                error: errorMessage,
                squareErrors: result.errors
            }), {
                status: 400,
                headers: {'Content-Type': 'application/json'}
            });
        }

        // Check if we got a payment object
        const payment = result.payment;
        if (!payment) {
            console.log('❌ No payment object returned from Square');
            return new Response(JSON.stringify({
                success: false, 
                error: 'Payment object not returned from Square',
                squareResponse: result
            }), {
                status: 500,
                headers: {'Content-Type': 'application/json'}
            });
        }

        console.log('✅ Payment processed:', {
            paymentId: payment.id,
            status: payment.status,
            amount: payment.amount_money?.amount,
            cardBrand: payment.card_details?.card?.card_brand
        });

        // Since autocomplete is true, we expect the payment to be COMPLETED.
        if (payment.status === 'COMPLETED') {
            console.log('🎉 Payment completed successfully');
            return new Response(JSON.stringify({
                success: true,
                payment: payment
            }), {
                status: 200,
                headers: {'Content-Type': 'application/json'}
            });
        } else {
            console.log('❌ Unexpected payment status:', payment.status);
            return new Response(JSON.stringify({
                success: false,
                error: `Unexpected payment status: ${payment.status}`,
                payment: payment
            }), {
                status: 400, // Bad request, as the status should be COMPLETED
                headers: {'Content-Type': 'application/json'}
            });
        }

    } catch (error) {
        console.error('💥 Payment processing error:', error);
        return new Response(JSON.stringify({
            success: false,
            error: error.message || 'Internal server error',
            stack: error.stack
        }), {
            status: 500,
            headers: {'Content-Type': 'application/json'}
        });
    }
}
