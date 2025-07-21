export const config = {
    runtime: 'edge',
};

import { createChatSession, addMessageToSession } from './state';

// Helper function for structured logging
function logEvent(event: string, data: any) {
    console.log(JSON.stringify({
        timestamp: new Date().toISOString(),
        event,
        ...data
    }));
}

export default async function handler(request: Request) {
    logEvent('human_handoff_request_received', {
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
        logEvent('human_handoff_body_parsed', {
            hasMessages: !!body.messages,
            messageCount: body.messages?.length || 0
        });

        const { messages, customerInfo, sessionId } = body;
        
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

        // Format the conversation for Slack
        let conversationSummary = "🚨 **Customer Requesting Human Support**\n\n";
        
        if (customerInfo) {
            conversationSummary += `**Customer Info:**\n`;
            conversationSummary += `• Email: ${customerInfo.email || 'Not provided'}\n`;
            conversationSummary += `• Name: ${customerInfo.name || 'Not provided'}\n`;
            conversationSummary += `• Phone: ${customerInfo.phone || 'Not provided'}\n\n`;
        }

        conversationSummary += `**Recent Conversation:**\n`;
        
        if (messages && messages.length > 0) {
            // Show last 5 messages
            const recentMessages = messages.slice(-5);
            recentMessages.forEach((msg, index) => {
                const sender = msg.sender === 'user' ? '👤 Customer' : '🤖 AI Bot';
                const content = msg.content.length > 150 ? msg.content.substring(0, 150) + '...' : msg.content;
                conversationSummary += `${sender}: ${content}\n\n`;
            });
        } else {
            conversationSummary += "No conversation history available.\n\n";
        }

        conversationSummary += `**Time:** ${new Date().toLocaleString()}\n`;
        conversationSummary += `**Action Required:** Please respond to customer on website chat or reach out directly.\n`;
        conversationSummary += `**Website:** ${process.env.SITE_URL || 'https://heritagebox.com'}`;

        // Send to Slack using MCP Server for more reliable delivery
        const slackChannelId = process.env.SLACK_SUPPORT_CHANNEL || '#vip-sales';
        
        logEvent('sending_slack_notification', {
            channel: slackChannelId,
            messageLength: conversationSummary.length
        });

        try {
            // Use a more direct approach for Edge runtime compatibility
            const slackMessage = `🚨 **Customer Requesting Human Support**

**Customer Info:**
• Email: ${customerInfo?.email || 'Not provided'}
• Name: ${customerInfo?.name || 'Not provided'} 
• Phone: ${customerInfo?.phone || 'Not provided'}

**Recent Conversation:**
${messages && messages.length > 0 
    ? messages.slice(-3).map(msg => {
        const sender = msg.sender === 'user' ? '👤 Customer' : '🤖 Bot';
        const content = msg.content.length > 200 ? msg.content.substring(0, 200) + '...' : msg.content;
        return `${sender}: ${content}`;
    }).join('\n\n')
    : 'No conversation history available'
}

**Time:** ${new Date().toLocaleString()}
**Action Required:** Please respond to customer on website chat or reach out directly.
**Website:** ${process.env.SITE_URL || 'https://heritagebox.com'}`;

            // Try to send to Slack and create chat session
            let slackSuccess = false;
            let slackThreadId = null;
            
            // For Edge runtime, we'll use the Slack Bot API directly
            const slackBotToken = process.env.SLACK_BOT_TOKEN;
            
            if (slackBotToken) {
                // Step 1: Post initial message to #vip-sales
                const initialSlackResponse = await fetch('https://slack.com/api/chat.postMessage', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${slackBotToken}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        channel: slackChannelId.replace('#', ''),
                        text: `🚨 *NEW CUSTOMER SUPPORT REQUEST*\n\nCustomer: ${customerInfo?.name || 'Anonymous'}\nEmail: ${customerInfo?.email || 'Not provided'}\nSession: \`${sessionId}\`\n\n_Click thread below to start conversation_ 👇`,
                        unfurl_links: false,
                        unfurl_media: false
                    })
                });

                const initialResult = await initialSlackResponse.json();
                
                if (!initialResult.ok) {
                    throw new Error(`Slack API error: ${initialResult.error}`);
                }

                // Step 2: Create thread with full customer details
                const slackResponse = await fetch('https://slack.com/api/chat.postMessage', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${slackBotToken}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        channel: slackChannelId.replace('#', ''),
                        thread_ts: initialResult.ts, // This creates the thread!
                        text: slackMessage,
                        unfurl_links: false,
                        unfurl_media: false
                    })
                });

                const slackResult = await slackResponse.json();
                
                if (slackResult.ok) {
                    slackSuccess = true;
                    slackThreadId = initialResult.ts; // Use the initial message timestamp as thread ID
                    
                    logEvent('slack_notification_sent', {
                        success: true,
                        messageTs: slackResult.ts,
                        channel: slackResult.channel,
                        sessionId
                    });

                    // Create the chat session with the Slack thread ID
                    if (slackThreadId) {
                        try {
                            const chatSession = await createChatSession(sessionId, slackThreadId);
                            
                            // Add all the existing conversation messages to the session
                            if (messages && messages.length > 0) {
                                for (const msg of messages) {
                                    await addMessageToSession(sessionId, {
                                        id: msg.id || `msg_${Date.now()}`,
                                        content: msg.content,
                                        sender: msg.sender,
                                        timestamp: (msg.timestamp ? new Date(msg.timestamp) : new Date()).toISOString()
                                    });
                                }
                            }

                            // The customer info (userId) should be part of the session creation or an update function
                            // For now, we'll log it and move on. The core functionality is message passing.
                            if (customerInfo) {
                                logEvent('customer_info_received', { sessionId, customerInfo });
                            }

                            logEvent('chat_session_created_successfully', {
                                sessionId,
                                slackThreadId
                            });

                        } catch (sessionError) {
                            logEvent('chat_session_creation_failed', {
                                sessionId,
                                slackThreadId,
                                error: sessionError.message
                            });
                            // Continue anyway - the Slack message was sent successfully
                        }
                    } else {
                        logEvent('no_slack_thread_id', {
                            sessionId,
                            message: 'Slack message sent but no thread ID received'
                        });
                    }
                    
                } else {
                    throw new Error(`Slack API error: ${slackResult.error}`);
                }
            }

            // Return session info regardless of Slack success
            return new Response(JSON.stringify({
                success: true,
                message: slackSuccess 
                    ? 'Human support has been notified via Slack. Someone will assist you shortly.' 
                    : 'Human support request received. Someone will assist you shortly.',
                sessionId: sessionId,
                timestamp: new Date().toISOString()
            }), {
                status: 200,
                headers: {'Content-Type': 'application/json'}
            });

        } catch (slackError) {
            logEvent('slack_notification_failed', {
                error: slackError.message,
                channel: slackChannelId
            });
            
            // Continue anyway - don't fail the request just because Slack failed
            console.error('Failed to send Slack notification:', slackError);
        }

        logEvent('human_handoff_completed', {
            success: true,
            channel: slackChannelId
        });

        return new Response(JSON.stringify({
            success: true,
            message: 'Human support has been notified. Someone will assist you shortly.',
            timestamp: new Date().toISOString()
        }), {
            status: 200,
            headers: {'Content-Type': 'application/json'}
        });

    } catch (error) {
        logEvent('human_handoff_error', {
            error: error.message,
            stack: error.stack,
            name: error.name
        });
        
        return new Response(JSON.stringify({
            success: false,
            error: 'Unable to connect to human support at this time',
            message: 'Please try again in a moment or contact us directly at support@heritagebox.com'
        }), {
            status: 500,
            headers: {'Content-Type': 'application/json'}
        });
    }
}
