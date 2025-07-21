export const config = {
    runtime: 'edge',
};

interface SlackEvent {
    type: string;
    channel: string;
    user?: string;
    text?: string;
    ts?: string;
    thread_ts?: string;
    event_ts: string;
    subtype?: string;
    bot_id?: string;
}

interface SlackWebhookPayload {
    token?: string;
    challenge?: string; // For URL verification
    type: string;
    event?: SlackEvent;
}

import { getSessionBySlackThread, addMessageToSession } from './state';

function logEvent(event: string, data: any) {
    console.log(JSON.stringify({
        timestamp: new Date().toISOString(),
        event,
        ...data
    }));
}


export default async function handler(request: Request) {
    logEvent('slack_webhook_received', {
        method: request.method,
        url: request.url
    });

    if (request.method !== 'POST') {
        return new Response('Method not allowed', { status: 405 });
    }

    try {
        const body = await request.json();
        logEvent('slack_webhook_payload', { type: body.type });

        // Handle URL verification challenge
        if (body.type === 'url_verification') {
            logEvent('slack_url_verification', { challenge: body.challenge });
            return new Response(body.challenge, {
                status: 200,
                headers: { 'Content-Type': 'text/plain' }
            });
        }

        // Handle incoming message events
        if (body.type === 'event_callback' && body.event) {
            const event: SlackEvent = body.event;
            
            logEvent('slack_event_received', {
                type: event.type,
                hasThreadTs: !!event.thread_ts,
                user: event.user,
                messagePreview: event.text?.substring(0, 50)
            });
            
            // We only care about messages from human agents inside a thread.
            if (event.type === 'message' && event.thread_ts && event.user && !event.bot_id) {
                
                const session = await getSessionBySlackThread(event.thread_ts);
                
                logEvent('slack_thread_message_received', {
                    threadId: event.thread_ts,
                    foundSessionId: session ? session.sessionId : null,
                });
                
                if (session && event.text) {
                    // Clean the message text
                    const cleanText = event.text
                        .replace(/^👤\s*\*\*Customer:\*\*\s*/gi, '')
                        .replace(/^🤖\s*\*\*Bot:\*\*\s*/gi, '')
                        .replace(/^\*\*(.*?)\*\*:\s*/gi, '')
                        .trim();

                    const agentMessage = {
                        id: `agent_${event.ts || Date.now()}`,
                        content: cleanText,
                        sender: 'agent' as const,
                        timestamp: new Date().toISOString()
                    };
                    
                    await addMessageToSession(session.sessionId, agentMessage);
                    
                } else {
                    logEvent('slack_thread_not_mapped_or_empty_message', { 
                        threadId: event.thread_ts
                    });
                }
            }
        }

        return new Response('OK', { status: 200 });

    } catch (error) {
        logEvent('slack_webhook_error', {
            error: error.message,
            stack: error.stack
        });
        
        return new Response('Internal Server Error', { status: 500 });
    }
}
