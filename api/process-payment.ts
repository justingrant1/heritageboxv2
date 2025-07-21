export const config = {
    runtime: 'edge',
};

// Helper function for structured logging
function logEvent(event: string, data: any) {
    console.log(JSON.stringify({
        timestamp: new Date().toISOString(),
        event,
        ...data
    }));
}

export default async function handler(request: Request) {
    logEvent('payment_request_received', {
        method: request.method,
        url: request.url
    });

    if (request.method !== 'POST') {
        return new Response(JSON.stringify({success: false, error: 'Method not allowed'}), {
            status: 405,
            headers: {'Content-Type': 'application/json'}
        });
    }

    try {
        const body = await request.json();
        const {token, amount, orderDetails} = body;

        logEvent('payment_request_parsed', {
            hasToken: !!token,
            amount: amount,
            hasOrderDetails: !!orderDetails
        });

        if (!token || !amount) {
            logEvent('payment_validation_failed', {
                missingToken: !token,
                missingAmount: !amount
            });
            return new Response(JSON.stringify({success: false, error: 'Missing required fields'}), {
                status: 400,
                headers: {'Content-Type': 'application/json'}
            });
        }

        // Environment variables
        const squareAccessToken = process.env.SQUARE_ACCESS_TOKEN;
        const SQUARE_LOCATION_ID = process.env.SQUARE_LOCATION_ID;
        const SQUARE_API_URL = process.env.SQUARE_API_URL;

        if (!squareAccessToken || !SQUARE_LOCATION_ID || !SQUARE_API_URL) {
            logEvent('payment_configuration_error', {
                hasAccessToken: !!squareAccessToken,
                hasLocationId: !!SQUARE_LOCATION_ID,
                hasApiUrl: !!SQUARE_API_URL
            });
            return new Response(JSON.stringify({success: false, error: 'Payment service not configured'}), {
                status: 500,
                headers: {'Content-Type': 'application/json'}
            });
        }

        logEvent('creating_square_payment', {
            amount: amount,
            locationId: SQUARE_LOCATION_ID,
            apiUrl: SQUARE_API_URL
        });

        // Generate idempotency key (edge runtime compatible)
        const idempotencyKey = `hb-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        
        // Create payment with explicit capture
        const paymentBody = {
            source_id: token,
            amount_money: {
                amount: Math.round(amount * 100), // Convert to cents
                currency: 'USD'
            },
            location_id: SQUARE_LOCATION_ID,
            idempotency_key: idempotencyKey,
            // Add note for tracking
            note: orderDetails ? `${orderDetails.package} Package - ${orderDetails.customerInfo?.email || 'No email'}` : 'Heritage Box Order',
            // Explicitly set autocomplete to true AND add accept_partial_authorization to false
            autocomplete: true,
            accept_partial_authorization: false
        };

        logEvent('square_payment_request', {
            paymentBody: paymentBody,
            endpoint: `${SQUARE_API_URL}/v2/payments`
        });

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
        
        logEvent('square_payment_response', {
            status: response.status,
            ok: response.ok,
            hasErrors: !!result.errors,
            paymentId: result.payment?.id,
            paymentStatus: result.payment?.status,
            fullResponse: result
        });

        if (!response.ok) {
            logEvent('square_payment_failed', {
                status: response.status,
                errors: result.errors
            });
            
            const errorMessage = result.errors?.[0]?.detail || result.errors?.[0]?.code || 'Payment failed';
            throw new Error(errorMessage);
        }

        // Check payment status explicitly
        const payment = result.payment;
        if (!payment) {
            throw new Error('Payment object not returned from Square');
        }

        logEvent('payment_status_check', {
            paymentId: payment.id,
            status: payment.status,
            amountMoney: payment.amount_money,
            cardDetails: payment.card_details
        });

        // Verify the payment was actually completed/captured
        if (payment.status !== 'COMPLETED') {
            logEvent('payment_not_completed', {
                paymentId: payment.id,
                actualStatus: payment.status,
                expectedStatus: 'COMPLETED'
            });

            // If payment is only AUTHORIZED, try to capture it explicitly
            if (payment.status === 'AUTHORIZED') {
                logEvent('attempting_manual_capture', {
                    paymentId: payment.id
                });

                try {
                    const captureResponse = await fetch(`${SQUARE_API_URL}/v2/payments/${payment.id}/complete`, {
                        method: 'POST',
                        headers: {
                            'Square-Version': '2024-02-15',
                            'Authorization': `Bearer ${squareAccessToken}`,
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({})
                    });

                    const captureResult = await captureResponse.json();
                    
                    logEvent('manual_capture_response', {
                        status: captureResponse.status,
                        ok: captureResponse.ok,
                        captureResult: captureResult
                    });

                    if (captureResponse.ok && captureResult.payment) {
                        logEvent('manual_capture_successful', {
                            paymentId: captureResult.payment.id,
                            finalStatus: captureResult.payment.status
                        });
                        
                        return new Response(JSON.stringify({
                            success: true,
                            payment: captureResult.payment,
                            captureMethod: 'manual'
                        }), {
                            status: 200,
                            headers: {'Content-Type': 'application/json'}
                        });
                    } else {
                        throw new Error(`Manual capture failed: ${captureResult.errors?.[0]?.detail || 'Unknown capture error'}`);
                    }
                } catch (captureError) {
                    logEvent('manual_capture_error', {
                        paymentId: payment.id,
                        error: captureError.message
                    });
                    throw new Error(`Payment authorized but capture failed: ${captureError.message}`);
                }
            } else {
                throw new Error(`Payment status is ${payment.status}, expected COMPLETED`);
            }
        }

        logEvent('payment_completed_successfully', {
            paymentId: payment.id,
            status: payment.status,
            amount: payment.amount_money?.amount,
            cardBrand: payment.card_details?.card?.card_brand,
            lastFour: payment.card_details?.card?.last_4
        });

        return new Response(JSON.stringify({
            success: true,
            payment: payment,
            captureMethod: 'automatic'
        }), {
            status: 200,
            headers: {'Content-Type': 'application/json'}
        });

    } catch (error) {
        logEvent('payment_processing_error', {
            error: error.message,
            stack: error.stack
        });

        return new Response(JSON.stringify({
            success: false,
            error: error.message || 'Internal server error'
        }), {
            status: 500,
            headers: {'Content-Type': 'application/json'}
        });
    }
}
