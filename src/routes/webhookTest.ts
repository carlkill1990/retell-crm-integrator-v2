import { Router } from 'express';
import axios from 'axios';
import fs from 'fs';
import path from 'path';

const router = Router();

// Test webhook endpoint to process Retell data and send to Pipedrive
router.post('/test-retell-webhook', async (req, res) => {
  try {
    console.log('🧪 Testing webhook with real Retell data...');

    // Load test data (real webhook payload)
    const testDataPath = path.join(process.cwd(), 'test-webhook-data.json');
    const testData = JSON.parse(fs.readFileSync(testDataPath, 'utf8'));
    
    console.log('📞 Processing call data:', {
      callId: testData.call_id,
      name: testData.retell_llm_dynamic_variables.name,
      phone: testData.retell_llm_dynamic_variables.phone,
      email: testData.retell_llm_dynamic_variables.email,
      procedure: testData.retell_llm_dynamic_variables.procedure
    });

    // Extract contact info for matching
    const contactData = {
      name: testData.retell_llm_dynamic_variables.name,
      phone: testData.retell_llm_dynamic_variables.phone,
      email: testData.retell_llm_dynamic_variables.email,
    };

    // Step 1: Try to find existing contact by phone
    console.log('🔍 Step 1: Searching for contact by phone:', contactData.phone);
    let personId = await findContactByPhone(contactData.phone);
    
    // Step 2: If no phone match, try email
    if (!personId && contactData.email) {
      console.log('🔍 Step 2: Searching for contact by email:', contactData.email);
      personId = await findContactByEmail(contactData.email);
    }
    
    // Step 3: Create new contact if no match found
    if (!personId) {
      console.log('🆕 Step 3: Creating new contact...');
      personId = await createNewContact(contactData);
    } else {
      console.log('✅ Found existing contact, person_id:', personId);
    }

    // Step 4: Create activity linked to contact
    console.log('📝 Step 4: Creating call activity...');
    
    // Simple call transcript with essentials
    const callDate = new Date(testData.start_timestamp).toLocaleString('en-GB', {
      timeZone: 'Europe/London',
      year: 'numeric',
      month: '2-digit', 
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
    const durationSeconds = Math.round(testData.duration_ms / 1000);
    // Format transcript with HTML and emojis for better readability
    const formattedTranscript = testData.transcript
      .split('\n')
      .map(line => {
        if (line.startsWith('Agent:')) {
          return `🤖 <strong>Agent:</strong> ${line.replace('Agent:', '').trim()}`;
        } else if (line.startsWith('User:')) {
          return `👤 <strong>User:</strong> ${line.replace('User:', '').trim()}`;
        }
        return line;
      })
      .join('<br>');

    const simpleNote = `<strong>Call Transcript - ${callDate} (${durationSeconds}s)</strong><br><br>
<strong>Recording:</strong> <a href="${testData.recording_url}" target="_blank">Listen to Recording</a><br><br>
${formattedTranscript}`;

    // Get the call time from the webhook data
    const callDateTime = new Date(testData.start_timestamp);
    const dueDate = callDateTime.toISOString().split('T')[0]; // YYYY-MM-DD
    const dueTime = callDateTime.toISOString().split('T')[1].substring(0, 5); // HH:MM

    const activityId = await createCallActivity({
      person_id: personId,
      note: simpleNote,
      subject: `${testData.direction === 'inbound' ? 'Inbound' : 'Outbound'} Call: ${testData.retell_llm_dynamic_variables.procedure}`,
      type: 'call',
      due_date: dueDate,
      due_time: dueTime
    });

    // Step 5: Create deal only if call was successful
    let dealId = null;
    if (testData.call_analysis?.call_successful === true) {
      console.log('💰 Step 5: Creating deal (call was successful)...');
      dealId = await createDeal({
        person_id: personId,
        title: `${testData.retell_llm_dynamic_variables.procedure} - ${contactData.name}`,
        value: 5000 // Example value
      });
    } else {
      console.log('🚫 Step 5: Skipping deal creation (call was not successful)');
    }

    console.log('🎉 Webhook test completed successfully!');
    res.json({
      success: true,
      results: {
        person_id: personId,
        activity_id: activityId,
        deal_id: dealId,
        message: 'Real webhook data processed successfully'
      }
    });

  } catch (error) {
    console.error('❌ Webhook test failed:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Helper functions for Pipedrive API
async function findContactByPhone(phone: string): Promise<number | null> {
  try {
    const response = await axios.get('https://api.pipedrive.com/v1/persons/search', {
      params: {
        term: phone,
        fields: 'phone',
        api_token: 'USER_SPECIFIC_TOKEN_REQUIRED' // Multi-tenant: each user needs their own token
      }
    });

    if (response.data?.success && response.data?.data?.items?.length > 0) {
      const personId = response.data.data.items[0].item.id;
      const name = response.data.data.items[0].item.name;
      console.log(`📞 Found existing contact by phone: ${personId} (${name})`);
      return personId;
    }
    console.log('📞 No contact found by phone');
    return null;
  } catch (error) {
    console.log('📞 Phone search failed:', (error as any).response?.data || (error as any).message);
    return null;
  }
}

async function findContactByEmail(email: string): Promise<number | null> {
  try {
    const response = await axios.get('https://api.pipedrive.com/v1/persons/search', {
      params: {
        term: email,
        fields: 'email',
        api_token: 'USER_SPECIFIC_TOKEN_REQUIRED' // Multi-tenant: each user needs their own token
      }
    });

    if (response.data?.success && response.data?.data?.items?.length > 0) {
      const personId = response.data.data.items[0].item.id;
      const name = response.data.data.items[0].item.name;
      console.log(`📧 Found existing contact by email: ${personId} (${name})`);
      return personId;
    }
    console.log('📧 No contact found by email');
    return null;
  } catch (error) {
    console.log('📧 Email search failed:', (error as any).response?.data || (error as any).message);
    return null;
  }
}

async function createNewContact(contactData: any): Promise<number> {
  const response = await axios.post('https://api.pipedrive.com/v1/persons', {
    name: contactData.name,
    phone: contactData.phone,
    email: contactData.email
  }, {
    headers: {
      'Content-Type': 'application/json'
    },
    params: {
      api_token: process.env.PIPEDRIVE_ACCESS_TOKEN
    }
  });

  const personId = response.data.data.id;
  console.log(`🆕 Created new contact: ${personId}`);
  return personId;
}

async function createCallActivity(activityData: any): Promise<number> {
  const response = await axios.post('https://api.pipedrive.com/v1/activities', {
    person_id: activityData.person_id,
    subject: activityData.subject,
    note: activityData.note,
    type: activityData.type,
    due_date: activityData.due_date,
    due_time: activityData.due_time,
    done: true // Mark as completed since call already happened
  }, {
    headers: {
      'Content-Type': 'application/json'
    },
    params: {
      api_token: process.env.PIPEDRIVE_ACCESS_TOKEN
    }
  });

  const activityId = response.data.data.id;
  console.log(`📝 Created activity: ${activityId}`);
  return activityId;
}

async function createDeal(dealData: any): Promise<number> {
  const response = await axios.post('https://api.pipedrive.com/v1/deals', {
    person_id: dealData.person_id,
    title: dealData.title,
    value: dealData.value,
    currency: 'GBP'
  }, {
    headers: {
      'Content-Type': 'application/json'
    },
    params: {
      api_token: process.env.PIPEDRIVE_ACCESS_TOKEN
    }
  });

  const dealId = response.data.data.id;
  console.log(`💰 Created deal: ${dealId}`);
  return dealId;
}

export default router;