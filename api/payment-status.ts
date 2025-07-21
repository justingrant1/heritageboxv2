// api/payment-status.ts
export default async function handler(request: Request) {
    const { searchParams } = new URL(request.url);
    const paymentId = searchParams.get('paymentId');

    if (!paymentId) {
        return new Response(JSON.stringify({ success: false, error: 'Missing paymentId' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    const squareAccessToken = process.env.SQUARE_ACCESS_TOKEN;
    const SQUARE_API_URL = process.env.SQUARE_API_URL;

    if (!squareAccessToken || !SQUARE_API_URL) {
        return new Response(JSON.stringify({ success: false, error: 'Payment service not configured' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    try {
        const response = await fetch(`${SQUARE_API_URL}/v2/payments/${paymentId}`, {
            method: 'GET',
            headers: {
                'Square-Version': '2024-02-15',
                'Authorization': `Bearer ${squareAccessToken}`,
                'Content-Type': 'application/json',
            },
        });

        const result = await response.json();

        if (!response.ok) {
            return new Response(JSON.stringify({ success: false, error: 'Failed to get payment status' }), {
                status: response.status,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        return new Response(JSON.stringify({ success: true, payment: result.payment }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        });
    } catch (error) {
        return new Response(JSON.stringify({ success: false, error: 'Internal server error' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
}
