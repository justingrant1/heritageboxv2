// Test script to verify Claude integration with Airtable
import claudeService from './src/services/claudeService.ts';
import airtableService from './src/services/airtableService.ts';

async function testClaudeIntegration() {
  console.log('🧪 Testing Claude AI Integration...');
  
  try {
    // Test 1: Basic Claude API connection
    console.log('\n1. Testing Claude API connection...');
    const testMessages = [{
      role: 'user',
      content: 'Hello! Can you confirm you can respond?'
    }];
    
    const response = await claudeService.sendMessage(testMessages, claudeService.getSystemPrompt(), 50);
    console.log('✅ Claude API connected successfully');
    console.log('📝 Response preview:', response.substring(0, 100) + '...');
    
    // Test 2: Airtable connection
    console.log('\n2. Testing Airtable connection...');
    const testResult = await airtableService.lookupCustomerOrders('test@example.com');
    console.log('✅ Airtable service connected successfully');
    console.log('📊 Test lookup result:', testResult.message);
    
    // Test 3: Package pricing
    console.log('\n3. Testing package pricing retrieval...');
    const pricing = await airtableService.getPackagePricing();
    console.log('✅ Package pricing retrieved successfully');
    console.log('💰 Available packages:', Object.keys(pricing));
    
    console.log('\n🎉 All integration tests passed! The chatbot should work properly.');
    return true;
    
  } catch (error) {
    console.error('❌ Integration test failed:', error);
    console.error('🔍 Error details:', error.message);
    return false;
  }
}

// Run the test
testClaudeIntegration()
  .then(success => {
    if (success) {
      console.log('\n✅ Integration test completed successfully!');
      console.log('🚀 Your chatbot is ready to use Claude AI directly from the frontend.');
    } else {
      console.log('\n❌ Integration test failed. Please check your configuration.');
    }
  })
  .catch(error => {
    console.error('❌ Test execution error:', error);
  });
