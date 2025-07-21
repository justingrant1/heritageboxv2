export const config = {
    runtime: 'edge',
};

import { getChatSession } from './state';

interface GetMessagesRequest {
    sessionId: string;
    lastMessageId?: string;
}

function logEvent(event: string, data: any) {
    console.log(JSON.stringify({
        timestamp: new Date().toISOString(),
        event,
        ...data
    }));
}

export default async function handler(request: Request) {
    logEvent('chat_messages_request_received', {
        method: request.method,
        url: request.url
    });

    if (request.method !== 'GET') {
        return new Response(JSON.stringify({
            success: false, 
            error: 'Method not allowed'
        }), {
            status: 405,
            headers: {'Content-Type': 'application/json'}
        });
    }

    try {
        const url = new URL(request.url);
        const sessionId = url.searchParams.get('sessionId');
        const lastMessageId = url.searchParams.get('lastMessageId');

        if (!sessionId) {
            logEvent('validation_failed', { missingSessionId: true });
            return new Response(JSON.stringify({
                success: false, 
                error: 'Session ID is required'
            }), {
                status: 400,
                headers: {'Content-Type': 'application/json'}
            });
        }

        // Get the chat session
        const session = await getChatSession(sessionId);
        
        if (!session) {
            logEvent('session_not_found', { sessionId });
            return new Response(JSON.stringify({
                success: true,
                messages: [],
                sessionExists: false
            }), {
                status: 200,
                headers: {'Content-Type': 'application/json'}
            });
        }

        // Get messages after the last message ID
        let messagesToReturn = session.messages;
        
        if (lastMessageId) {
            const lastIndex = session.messages.findIndex(msg => msg.id === lastMessageId);
            if (lastIndex !== -1) {
                messagesToReturn = session.messages.slice(lastIndex + 1);
            }
        }

        // Filter out user messages to avoid duplicates (user already has them)
        const newMessages = messagesToReturn.filter(msg => msg.sender !== 'user');

        logEvent('chat_messages_retrieved', {
            sessionId,
            totalMessages: session.messages.length,
            newMessages: newMessages.length,
            lastMessageId
        });

        return new Response(JSON.stringify({
            success: true,
            messages: newMessages.map(msg => ({
                id: msg.id,
                content: msg.content,
                sender: msg.sender,
                timestamp: msg.timestamp 
            })),
            debugLog: session.debugLog, // Send debug logs to the client
            sessionExists: true,
            lastActivity: new Date(session.lastActivity).toISOString()
        }), {
            status: 200,
            headers: {'Content-Type': 'application/json'}
        });

    } catch (error) {
        let errorDetails: any = {
            message: 'An unknown error occurred',
            name: 'UnknownError',
            stack: 'No stack trace available'
        };

        if (error instanceof Error) {
            errorDetails.message = error.message;
            errorDetails.name = error.name;
            errorDetails.stack = error.stack;
        } else if (typeof error === 'object' && error !== null) {
            errorDetails = { ...errorDetails, ...error };
        } else {
            errorDetails.message = String(error);
        }

        console.error('CHAT_MESSAGES_FATAL_ERROR:', JSON.stringify(errorDetails, null, 2));
        
        return new Response(JSON.stringify({
            success: false,
            error: 'Internal server error'
        }), {
            status: 500,
            headers: {'Content-Type': 'application/json'}
        });
    }
}
