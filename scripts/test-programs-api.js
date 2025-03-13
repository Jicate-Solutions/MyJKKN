// Test script for the programs API

async function testProgramsApi() {
  // Replace with a valid API key
  const apiKey = 'YOUR_API_KEY'; // Replace this with a real API key
  
  console.log('Testing programs API...');
  
  try {
    const response = await fetch('http://localhost:3000/api/api-management/organizations/programs', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      }
    });
    
    const data = await response.json();
    
    console.log('Status:', response.status);
    console.log('Response:', JSON.stringify(data, null, 2));
    
    return { status: response.status, data };
  } catch (error) {
    console.error('Error testing programs API:', error);
    return { error: error.message };
  }
}

// Run the test
testProgramsApi().then(result => {
  if (result.error) {
    console.error('Test failed:', result.error);
  } else if (result.status !== 200) {
    console.error('Test failed with status:', result.status);
  } else {
    console.log('Test succeeded!');
  }
});
