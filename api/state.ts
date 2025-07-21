import { Redis } from '@upstash/redis';

let redis: Redis;
try {
    const url = process.env.KV_REST_API_URL;
    const token = process.env.KV_REST_API_TOKEN;

    if (!url || !token) {
        throw new Error('KV_REST_API_URL or KV_REST_API_TOKEN is not defined in environment variables.');
    }

    // Initialize Redis client from environment variables
    // Vercel's KV integration (powered by Upstash) uses these specific names
    redis = new Redis({
      url: url,
      token: token,
    });
    console.log('Redis client initialized successfully.');
} catch (error) {
    console.error('FATAL: Failed to initialize Redis client.', {
        errorMessage: error.message,
        hasUrl: !!process.env.KV_REST_API_URL,
        hasToken: !!process.env.KV_REST_API_TOKEN
    });
    // If Redis fails, the app is in a non-functional state.
    // We can't proceed, but this log will be critical for debugging.
}


// Define the session structure
export interface ChatSession {
    sessionId: string;
    slackThreadId: string;
    userId?: string;
    lastActivity: number;
    messages: Array<{
        id: string;
        content: string;
        sender: 'user' | 'bot' | 'agent';
        timestamp: string; // Use ISO string for JSON compatibility
    }>;
    debugLog: string[];
}

const SESSION_TTL_SECONDS = 86400; // 24 hours

// Helper to log events and optionally update the session in Redis
async function logEvent(event: string, data: any, session?: ChatSession | null) {
    const logMessage = `[${new Date().toISOString()}] ${event}: ${JSON.stringify(data)}`;
    console.log(logMessage);
    if (session) {
        session.debugLog.push(logMessage);
        // Update the session in Redis with the new log
        await redis.set(`session:${session.sessionId}`, JSON.stringify(session), { ex: SESSION_TTL_SECONDS });
    }
}

// Get a session from Redis
export async function getChatSession(sessionId: string): Promise<ChatSession | null> {
    const session = await redis.get<ChatSession>(`session:${sessionId}`);
    if (!session) {
        await logEvent('get_chat_session_failed', { sessionId, reason: 'not_found' });
        return null;
    }
    await logEvent('get_chat_session_success', { sessionId }, session);
    return session;
}

// Get a session by its corresponding Slack thread ID
export async function getSessionBySlackThread(thread_ts: string): Promise<ChatSession | null> {
    const sessionId = await redis.get(`thread:${thread_ts}`);
    if (!sessionId) {
        await logEvent('get_session_by_slack_thread_failed', { thread_ts, reason: 'session_id_not_found' });
        return null;
    }
    const session = await getChatSession(sessionId as string);
    // The logEvent in getChatSession already covers this. No need to double log.
    // await logEvent('get_session_by_slack_thread_success', { thread_ts, sessionId }, session);
    return session;
}

// Create a new session in Redis
export async function createChatSession(sessionId: string, slackThreadId: string): Promise<ChatSession> {
    const session: ChatSession = {
        sessionId,
        slackThreadId,
        lastActivity: Date.now(),
        messages: [],
        debugLog: []
    };
    
    const multi = redis.multi();
    multi.set(`session:${sessionId}`, JSON.stringify(session), { ex: SESSION_TTL_SECONDS });
    multi.set(`thread:${slackThreadId}`, sessionId, { ex: SESSION_TTL_SECONDS });
    await multi.exec();

    await logEvent('chat_session_created', { sessionId, slackThreadId }, session);
    return session;
}

// Add a message to an existing session
export async function addMessageToSession(sessionId: string, message: { id: string; content: string; sender: 'user' | 'bot' | 'agent'; timestamp: string; }) {
    const session = await getChatSession(sessionId);
    if (session) {
        session.messages.push(message);
        session.lastActivity = Date.now();
        
        await redis.set(`session:${sessionId}`, JSON.stringify(session), { ex: SESSION_TTL_SECONDS });
        
        await logEvent('message_added_to_session', { sessionId, messageId: message.id }, session);
    } else {
        await logEvent('add_message_to_session_failed', { sessionId, reason: 'session_not_found' });
    }
}
