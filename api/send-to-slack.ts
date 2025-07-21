export const config = {
    runtime: 'edge',
};

import { getChatSession, addMessageToSession } from './state';

interface SendToSlackRequest {
    sessionId: string;
    message: string;
    sender: 'user' | 'agent';
}

function logEvent(event: string, data: any) {
    console.log(JSON.stringify({
        timestamp: new Date().toISOString(),
        event,
        ...data
    }));
}

export default async function handler(request: Request) {
    logEvent('send_to_slack_request_received', {
        method: request.method,
        url: request.url
    });

    if (request.method !== 'POST') {
        return new Response(JSON.stringify({
            success: false, 
            error: 'Method not allowed'
        }), {
            status: 405,
            headers: {'Content-Type': 'application/json'}
        });
    }

    try {
        const body = await request.json();
        const { sessionId, message, sender }: SendToSlackRequest = body;

        logEvent('send_to_slack_body_parsed', {
            sessionId,
            messageLength: message?.length || 0,
            sender
        });

        if (!sessionId || !message || !sender) {
            logEvent('validation_failed', { 
                missingSessionId: !sessionId,
                missingMessage: !message,
                missingSender: !sender
            });
            return new Response(JSON.stringify({
                success: false, 
                error: 'Session ID, message, and sender are required'
            }), {
                status: 400,
                headers: {'Content-Type': 'application/json'}
            });
        }

        // Get the chat session to find the Slack thread ID
        const session = await getChatSession(sessionId);
        
        if (!session) {
            logEvent('session_not_found', { sessionId });
            return new Response(JSON.stringify({
                success: false,
                error: 'Chat session not found. Please request human support again.'
            }), {
                status: 404,
                headers: {'Content-Type': 'application/json'}
            });
        }

        if (!session.slackThreadId) {
            logEvent('no_slack_thread', { sessionId });
            return new Response(JSON.stringify({
                success: false,
                error: 'No Slack thread associated with this session'
            }), {
                status: 400,
                headers: {'Content-Type': 'application/json'}
            });
        }

        // Format message for Slack (convert HTML to plain text/markdown)
        const formattedMessage = formatMessageForSlack(message, sender);

        // Send message to Slack thread
        const slackBotToken = process.env.SLACK_BOT_TOKEN;
        const slackChannelId = process.env.SLACK_SUPPORT_CHANNEL || '#vip-sales';

        if (!slackBotToken) {
            logEvent('slack_bot_token_missing', { sessionId });
            return new Response(JSON.stringify({
                success: false,
                error: 'Slack integration not configured'
            }), {
                status: 500,
                headers: {'Content-Type': 'application/json'}
            });
        }

        logEvent('sending_to_slack', {
            sessionId,
            threadId: session.slackThreadId,
            channel: slackChannelId,
            messagePreview: formattedMessage.substring(0, 100)
        });

        const slackResponse = await fetch('https://slack.com/api/chat.postMessage', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${slackBotToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                channel: slackChannelId.replace('#', ''),
                text: `📧 *Session: ${sessionId}*\n${formattedMessage}`,
                thread_ts: session.slackThreadId, // This keeps it in the customer's thread
                unfurl_links: false,
                unfurl_media: false
            })
        });

        const slackResult = await slackResponse.json();

        if (!slackResult.ok) {
            logEvent('slack_send_failed', {
                sessionId,
                error: slackResult.error,
                warning: slackResult.warning
            });
            return new Response(JSON.stringify({
                success: false,
                error: `Failed to send message to Slack: ${slackResult.error}`
            }), {
                status: 500,
                headers: {'Content-Type': 'application/json'}
            });
        }

        logEvent('slack_message_sent', {
            sessionId,
            threadId: session.slackThreadId,
            messageTs: slackResult.ts
        });

        // Store the message in the session
        const sessionMessage = {
            id: `${sender}_${Date.now()}`,
            content: message,
            sender: sender,
            timestamp: new Date().toISOString()
        };

        await addMessageToSession(sessionId, sessionMessage);

        logEvent('message_stored_in_session', {
            sessionId,
            messageId: sessionMessage.id
        });

        return new Response(JSON.stringify({
            success: true,
            messageId: sessionMessage.id,
            slackMessageId: slackResult.ts,
            timestamp: sessionMessage.timestamp
        }), {
            status: 200,
            headers: {'Content-Type': 'application/json'}
        });

    } catch (error) {
        logEvent('send_to_slack_error', {
            error: error.message,
            stack: error.stack
        });
        
        return new Response(JSON.stringify({
            success: false,
            error: 'Internal server error'
        }), {
            status: 500,
            headers: {'Content-Type': 'application/json'}
        });
    }
}

function formatMessageForSlack(message: string, sender: 'user' | 'agent'): string {
    // Convert HTML to plain text and add sender context
    let cleanMessage = message
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<strong>(.*?)<\/strong>/gi, '*$1*')
        .replace(/<em>(.*?)<\/em>/gi, '_$1_')
        .replace(/<[^>]*>/g, '') // Remove any remaining HTML tags
        .trim();

    // Add sender prefix for clarity
    const prefix = sender === 'user' ? '👤 **Customer:**' : '🤖 **Bot:**';
    
    return `${prefix} ${cleanMessage}`;
}
