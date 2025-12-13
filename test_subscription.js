/**
 * AppSync WebSocket Subscription Test
 * 
 * Minimal client to test subscription event loss after start_ack
 */

// Validate command line arguments
if (process.argv.length !== 5) {
    console.log(`${new Date().toISOString()} Usage: node test_subscription.js <realtime-endpoint> <graphql-endpoint> <api-key>`);
    console.log(`${new Date().toISOString()} Example: node test_subscription.js wss://abc123.appsync-realtime-api.us-east-1.amazonaws.com/graphql https://abc123.appsync-api.us-east-1.amazonaws.com/graphql da2-xyz123`);
    process.exit(1);
}

const realtimeEndpoint = process.argv[2];
const graphqlEndpoint = process.argv[3];
const apiKey = process.argv[4];

console.log(`${new Date().toISOString()} 🧪 AppSync Subscription Event Loss Test`);
console.log(`${new Date().toISOString()} 🔗 Real-time endpoint: ${realtimeEndpoint}`);
console.log(`${new Date().toISOString()} 🔗 GraphQL endpoint: ${graphqlEndpoint}`);
console.log(`${new Date().toISOString()} 🔑 API Key: ${apiKey.substring(0, 10)}...`);

// GraphQL queries
const subscriptionQuery = `
subscription OnEchoMessage {
  onEchoMessage
}
`;

const mutationQuery = `
mutation EchoMessage($message: String!) {
  echoMessage(message: $message)
}
`;

// WebSocket state
let ws = null;
let subscriptionId = null;
let messageQueue = [];

// Extract host from URL
function extractHostFromUrl(url) {
    let host = url.replace(/^https?:\/\//, '').replace(/^wss?:\/\//, '');
    host = host.split('/')[0];
    return host;
}

// Connect WebSocket
console.log(`${new Date().toISOString()} 🔌 Connecting to WebSocket...`);

const headers = {
    host: extractHostFromUrl(graphqlEndpoint),
    'x-api-key': apiKey
};

const headerJson = JSON.stringify(headers);
const headerB64 = btoa(headerJson);
const payloadB64 = btoa('{}');
const wsUrl = `${realtimeEndpoint}?header=${headerB64}&payload=${payloadB64}`;

ws = new WebSocket(wsUrl, ['graphql-ws']);

// WebSocket event handlers
ws.onopen = () => {
    console.log(`${new Date().toISOString()} 📤 WebSocket connected`);
    
    // Send connection_init
    console.log(`${new Date().toISOString()} 📤 Sending connection_init...`);
    ws.send(JSON.stringify({ type: 'connection_init' }));
};

ws.onerror = (error) => {
    console.error(`${new Date().toISOString()} ❌ WebSocket error: ${error.message}`);
    process.exit(1);
};

ws.onmessage = (event) => {
    try {
        const message = JSON.parse(event.data);
        console.log(`${new Date().toISOString()} 📥 Received message: ${JSON.stringify(message)}`);
        messageQueue.push(message);
        
        // Handle different message types
        if (message.type === 'connection_ack') {
            console.log(`${new Date().toISOString()} 📥 Received connection_ack`);
            
            // Subscribe after connection is acknowledged
            subscriptionId = crypto.randomUUID();
            console.log(`${new Date().toISOString()} 📤 Sending subscription start (ID: ${subscriptionId})...`);
            
            ws.send(JSON.stringify({
                id: subscriptionId,
                type: 'start',
                payload: {
                    data: JSON.stringify({
                        query: subscriptionQuery,
                        variables: {}
                    }),
                    extensions: {
                        authorization: {
                            host: extractHostFromUrl(graphqlEndpoint),
                            'x-api-key': apiKey
                        }
                    }
                }
            }));
        }
        else if (message.type === 'start_ack' && message.id === subscriptionId) {
            console.log(`${new Date().toISOString()} 📥 Received start_ack (ID: ${subscriptionId})`);
            
            // Immediately send mutation after receiving start_ack
            const testMessage = `Test message - ${Date.now()}`;
            console.log(`${new Date().toISOString()} 📤 Sending mutation with message: ${testMessage}...`);
            
            fetch(graphqlEndpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': apiKey
                },
                body: JSON.stringify({
                    query: mutationQuery,
                    variables: { message: testMessage }
                })
            })
            .then(response => response.json())
            .then(data => {
                console.log(`${new Date().toISOString()} 📥 Mutation response: ${JSON.stringify(data)}`);
            })
            .catch(error => {
                console.error(`${new Date().toISOString()} ❌ Mutation failed: ${error.message}`);
            });
        }
        else if (message.type === 'data' && message.id === subscriptionId) {
            console.log(`${new Date().toISOString()} 📥 Received subscription event: ${JSON.stringify(message.payload)}`);
            
            // Clean up and exit successfully
            ws.send(JSON.stringify({ id: subscriptionId, type: 'stop' }));
            setTimeout(() => {
                ws.close();
                console.log(`${new Date().toISOString()} ✅ Test completed successfully - event received`);
                process.exit(0);
            }, 1000);
        }
        else if (message.type === 'ka') {
            // Keep-alive message, ignore
        }
        else if (message.type === 'error') {
            console.error(`${new Date().toISOString()} ❌ Received error: ${JSON.stringify(message)}`);
            ws.close();
            process.exit(1);
        }
        
    } catch (e) {
        console.error(`${new Date().toISOString()} ❌ Error parsing message: ${e.message}`);
    }
};

ws.onclose = () => {
    console.log(`${new Date().toISOString()} 🔌 WebSocket disconnected`);
    console.log(`${new Date().toISOString()} ⚠️ Subscription event was not received`);
    process.exit(1);
};

// No timeout - wait indefinitely for subscription event