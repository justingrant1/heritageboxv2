export const config = {
    runtime: 'edge',
};

export default async function handler(request: Request) {
    const checkEnv = (varName: string): { status: string; valuePreview: string } => {
        const value = process.env[varName];
        if (value) {
            return { status: '✅ Set', valuePreview: `${value.substring(0, 4)}...${value.slice(-4)}` };
        }
        return { status: '❌ Not Set', valuePreview: 'N/A' };
    };

    const envStatus = {
        KV_REST_API_URL: checkEnv('KV_REST_API_URL'),
        KV_REST_API_TOKEN: checkEnv('KV_REST_API_TOKEN'),
        SLACK_BOT_TOKEN: checkEnv('SLACK_BOT_TOKEN'),
        SLACK_SUPPORT_CHANNEL: { status: '✅ Set', valuePreview: process.env.SLACK_SUPPORT_CHANNEL || '#vip-sales (default)' },
        CLAUDE_API_KEY: checkEnv('CLAUDE_API_KEY'),
        AIRTABLE_API_KEY: checkEnv('AIRTABLE_API_KEY'),
        AIRTABLE_BASE_ID: checkEnv('AIRTABLE_BASE_ID'),
        SITE_URL: { status: '✅ Set', valuePreview: process.env.SITE_URL || 'https://heritagebox.com (default)' },
    };

    return new Response(JSON.stringify(envStatus, null, 2), {
        status: 200,
        headers: { 
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache, no-store, must-revalidate'
        }
    });
}
