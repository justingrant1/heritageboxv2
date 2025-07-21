export const config = {
    runtime: 'edge',
};

// Square Catalog Product Mapping - Production IDs (verified from your production catalog)
const SQUARE_CATALOG_MAPPING = {
  packages: {
    'Starter': 'GNQP4YZH57MGVR265N4QA7QH',
    'Popular': 'MXDI5KGKHQE2G7MVWPGJWZIS', 
    'Dusty Rose': 'GKIADSF5IJQEAAKCIL2WXZEK',
    'Eternal': 'X2N4DL3YZBKJYAICCVYMSJ6Y'
  },
  addons: {
    'Custom USB Drive': 'SMW4WXZUAE6E5L3FTS76NC7Y',
    'Online Gallery & Backup': 'YJ3AGBF7MRHW2QQ6KI5DMSPG'
  },
  services: {
    'expedited': '37LXAW3CQ7ONF7AGNCYDWRRT',
    'rush': 'HSMOF4CINCKHVWUPCEN5ZBOU'
  }
};

// Package pricing for manual line items (when catalog IDs not available)
const PACKAGE_PRICING = {
  'Starter': 99,
  'Popular': 199,
  'Dusty Rose': 299,
  'Eternal': 499
};

// Helper function for structured logging
function logEvent(event: string, data: any) {
    console.log(JSON.stringify({
        timestamp: new Date().toISOString(),
        event,
        ...data
    }));
}

// Helper function to create line items from order details
function createLineItemsFromOrderDetails(orderDetails: any) {
    const lineItems: any[] = [];
    
    if (!orderDetails) {
        // Fallback line item if no order details provided
        return [{
            name: 'Heritage Box Service',
            quantity: '1',
            base_price_money: {
                amount: 9900, // $99.00 in cents
                currency: 'USD'
            }
        }];
    }

    // Main package line item
    if (orderDetails.package) {
        const packagePrice = PACKAGE_PRICING[orderDetails.package] || 99;
        lineItems.push({
            name: `${orderDetails.package} Package`,
            quantity: '1',
            base_price_money: {
                amount: packagePrice * 100, // Convert to cents
                currency: 'USD'
            }
        });
    }

    // Add-on line items
    if (orderDetails.addOns && Array.isArray(orderDetails.addOns)) {
        orderDetails.addOns.forEach((addOn: string) => {
            // Parse add-on string like "1 USB Drive(s) - $24.95"
            const match = addOn.match(/(\d+)\s+(.+?)\s*-\s*\$?(\d+(?:\.\d{2})?)/);
            if (match) {
                const [, quantity, name, price] = match;
                lineItems.push({
                    name: name.trim(),
                    quantity: quantity,
                    base_price_money: {
                        amount: Math.round(parseFloat(price) * 100), // Convert to cents
                        currency: 'USD'
                    }
                });
            }
        });
    }

    // If no line items were created, add a fallback
    if (lineItems.length === 0) {
        lineItems.push({
            name: 'Heritage Box Service',
            quantity: '1',
            base_price_money: {
                amount: 9900, // $99.00 in cents
                currency: 'USD'
            }
        });
    }

    return lineItems;
}

// Helper function to create discount from coupon
function createDiscountFromCoupon(orderDetails: any) {
    if (!orderDetails.couponCode) {
        return [];
    }

    // Handle percentage-based discounts
    if (orderDetails.discountPercent) {
        return [{
            name: `Coupon: ${orderDetails.couponCode}`,
            percentage: orderDetails.discountPercent.toString(),
            scope: 'ORDER'
        }];
    }

    // Handle fixed amount discounts
    if (orderDetails.discountAmount) {
        // Parse discount amount like "$93.01"
        const discountMatch = orderDetails.discountAmount.match(/\$?(\d+(?:\.\d{2})?)/);
        if (discountMatch) {
            const discountValue = parseFloat(discountMatch[1]);
            return [{
                name: `Coupon: ${orderDetails.couponCode}`,
                amount_money: {
                    amount: Math.round(discountValue * 100), // Convert to cents
                    currency: 'USD'
                },
                scope: 'ORDER'
            }];
        }
    }

    return [];
}

export default async function handler(request: Request) {
    logEvent('request_received', {
        method: request.method,
        url: request.url,
        headers: Object.fromEntries(request.headers.entries())
    });

    if (request.method !== 'POST') {
        logEvent('method_not_allowed', {method: request.method});
        return new Response(JSON.stringify({success: false, error: 'Method not allowed'}), {
            status: 405,
            headers: {'Content-Type': 'application/json'}
        });
    }

    try {
        const body = await request.json();
        logEvent('request_body_parsed', {
            hasToken: !!body.token,
            amount: body.amount,
            orderDetails: body.orderDetails
        });

        const {token, amount, orderDetails, couponCode} = body;

        if (!token || !amount) {
            logEvent('validation_failed', {
                missingToken: !token,
                missingAmount: !amount
            });
            return new Response(JSON.stringify({success: false, error: 'Missing required fields'}), {
                status: 400,
                headers: {'Content-Type': 'application/json'}
            });
        }

        const squareAccessToken = process.env.SQUARE_ACCESS_TOKEN;
        const SQUARE_LOCATION_ID = process.env.SQUARE_LOCATION_ID;
        const SQUARE_API_URL = process.env.SQUARE_API_URL;

        logEvent('environment_check', {
            hasAccessToken: !!squareAccessToken,
            hasLocationId: !!SQUARE_LOCATION_ID,
            hasApiUrl: !!SQUARE_API_URL,
            nodeEnv: process.env.NODE_ENV
        });

        if (!squareAccessToken) {
            logEvent('configuration_error', {error: 'SQUARE_ACCESS_TOKEN not configured'});
            return new Response(JSON.stringify({success: false, error: 'Payment service not configured - missing access token'}), {
                status: 500,
                headers: {'Content-Type': 'application/json'}
            });
        }

        if (!SQUARE_LOCATION_ID) {
            logEvent('configuration_error', {error: 'SQUARE_LOCATION_ID not configured'});
            return new Response(JSON.stringify({success: false, error: 'Payment service not configured - missing location ID'}), {
                status: 500,
                headers: {'Content-Type': 'application/json'}
            });
        }

        if (!SQUARE_API_URL) {
            logEvent('configuration_error', {error: 'SQUARE_API_URL not configured'});
            return new Response(JSON.stringify({success: false, error: 'Payment service not configured - missing API URL'}), {
                status: 500,
                headers: {'Content-Type': 'application/json'}
            });
        }

        logEvent('square_payment_initiated', {
            amount,
            locationId: SQUARE_LOCATION_ID,
            environment: process.env.NODE_ENV,
            customerEmail: orderDetails?.customerInfo?.email,
            packageType: orderDetails?.package
        });

        // Step 1: Create Order with line items first
        const orderIdempotencyKey = crypto.randomUUID();
        const lineItems = createLineItemsFromOrderDetails(orderDetails);
        
        const orderBody = {
            location_id: SQUARE_LOCATION_ID,
            order: {
                location_id: SQUARE_LOCATION_ID,
                line_items: lineItems,
                taxes: [],
                discounts: orderDetails?.couponCode ? createDiscountFromCoupon(orderDetails) : []
            },
            idempotency_key: orderIdempotencyKey
        };

        logEvent('creating_square_order', {
            locationId: SQUARE_LOCATION_ID,
            lineItemsCount: lineItems.length,
            hasDiscount: orderDetails?.couponCode ? true : false,
            orderIdempotencyKey
        });

        // Create the order first
        const orderResponse = await fetch(`${SQUARE_API_URL}/v2/orders`, {
            method: 'POST',
            headers: {
                'Square-Version': '2024-02-15',
                'Authorization': `Bearer ${squareAccessToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(orderBody)
        });

        const orderResult = await orderResponse.json();
        
        logEvent('square_order_response', {
            status: orderResponse.status,
            ok: orderResponse.ok,
            hasErrors: !!orderResult.errors,
            orderId: orderResult.order?.id,
            orderTotal: orderResult.order?.total_money?.amount
        });

        if (!orderResponse.ok) {
            logEvent('square_order_error', {
                status: orderResponse.status,
                errors: orderResult.errors,
                fullErrorResponse: orderResult
            });
            
            const errorMessage = orderResult.errors?.[0]?.detail || orderResult.errors?.[0]?.code || 'Order creation failed';
            throw new Error(`Order creation failed: ${errorMessage}`);
        }

        const createdOrder = orderResult.order;
        
        // Step 2: Create payment against the order
        const paymentIdempotencyKey = crypto.randomUUID();
        const paymentBody = {
            source_id: token,
            amount_money: {
                amount: Math.round(amount * 100), // Convert to cents
                currency: 'USD'
            },
            location_id: SQUARE_LOCATION_ID,
            order_id: createdOrder.id,
            idempotency_key: paymentIdempotencyKey,
            note: orderDetails ? `${orderDetails.package} Package - ${orderDetails.customerInfo?.email || 'No email'}` : 'Heritage Box Order'
        };

        logEvent('processing_payment_with_order', { 
            amount: paymentBody.amount_money.amount,
            orderId: createdOrder.id,
            paymentIdempotencyKey,
            note: paymentBody.note
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
            errorDetails: result.errors,
            paymentId: result.payment?.id,
            paymentStatus: result.payment?.status
        });

        if (!response.ok) {
            logEvent('square_payment_error', {
                status: response.status,
                errors: result.errors,
                fullErrorResponse: result
            });
            
            const errorMessage = result.errors?.[0]?.detail || result.errors?.[0]?.code || 'Payment failed';
            throw new Error(errorMessage);
        }

        logEvent('payment_successful', {
            paymentId: result.payment?.id,
            orderId: createdOrder.id,
            amount: result.payment?.amount_money?.amount,
            status: result.payment?.status
        });

        return new Response(JSON.stringify({
            success: true,
            payment: result.payment,
            order: createdOrder
        }), {
            status: 200,
            headers: {'Content-Type': 'application/json'}
        });
    } catch (error) {
        logEvent('payment_error', {
            error: error.message,
            stack: error.stack,
            name: error.name
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
