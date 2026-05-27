import fetch from 'node-fetch';

async function testLogin() {
  try {
    console.log('Testing login endpoint...');
    const response = await fetch('http://localhost:3000/api/trpc/auth.login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        json: {
          email: 'admin@farmer.com',
          password: 'Password123!'
        }
      })
    });
    
    console.log('Status:', response.status);
    console.log('Status Text:', response.statusText);
    
    const text = await response.text();
    console.log('Response:', text);
    
    if (text) {
      try {
        const json = JSON.parse(text);
        console.log('Parsed JSON:', JSON.stringify(json, null, 2));
      } catch (e) {
        console.log('Response is not JSON');
      }
    }
  } catch (error) {
    console.error('Error:', error.message);
  }
}

testLogin();
