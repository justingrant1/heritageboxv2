@echo off
echo 🤖 Setting up Heritagebox Claude AI Chatbot...
echo.

echo 📦 Installing dependencies...
npm install express cors dotenv @anthropic-ai/sdk nodemon

echo.
echo 🔑 Setting up environment file...
if not exist .env (
    echo # Heritagebox Chatbot Configuration > .env
    echo CLAUDE_API_KEY=your_claude_api_key_here >> .env
    echo ANTHROPIC_API_KEY=your_claude_api_key_here >> .env
    echo PORT=3001 >> .env
    echo. >> .env
    echo # Optional: Airtable Integration >> .env
    echo AIRTABLE_API_KEY=your_airtable_key >> .env
    echo AIRTABLE_BASE_ID=your_base_id >> .env
    echo.
    echo ✅ Created .env file - REMEMBER TO ADD YOUR CLAUDE API KEY!
) else (
    echo ⚠️  .env file already exists - skipping
)

echo.
echo 🚀 Setup complete! Next steps:
echo.
echo 1. Add your Claude API key to the .env file
echo 2. Run: node chat-server.js
echo 3. Open chatbot-demo.html in your browser
echo.
echo 🔗 Get your Claude API key at: https://console.anthropic.com/
echo.
pause
