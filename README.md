## start_ack test

The AppSync WebSocket protocol is described here: https://docs.aws.amazon.com/appsync/latest/devguide/real-time-websocket-client.html

When the subscription is established, AppSync sends a `start_ack` message. This should indicate that the subscription is active and future events will be
delivered via `data` events.

**It seems like this is not the case.** Even when a mutation is triggered strictly after receiving the `start_ack` the subscription event might not be
delivered. **This makes subscription handling unreliable** as there is not way to know when a subscription is really established.

This repo implements a reproduction for this issue. It runs a sequence repeatedly until it encounters a missing `data` event in which case it will get stuck
waiting.

Sequence:

* connect to WebSocket
* send `connection_init`
* wait for `connection_ack`
* send `start`
* wait for `start_ack`
* invoke a mutation
* wait for `data`
* close

Sometimes the `data` event does not arrive. Keeping a separate subscription (on the AppSync console, for example) shows that AppSync fired the event.

## Deploy

Take the yaml file and deploy to CloudFormation. In the outputs, it will print:

* the realtime endpoint
* the grapnql endpoint
* the API key

## Setup

```
export REALTIME_ENDPOINT="wss://..."
export GRAPHQL_ENDPOINT="https://..."
export API_KEY="da2-..."
```

## Run

```
while true; do echo "=== Test $(date +%H:%M:%S) ==="; node test_subscription.js $REALTIME_ENDPOINT $GRAPHQL_ENDPOINT $API_KEY; echo "Exit code: $?"; sleep 1; done
```

Will repeatedly run the script until it hits the error in which case it will stall.

A successful run (notice the `data` event):

```
2025-12-13T11:08:43.732Z 🧪 AppSync Subscription Event Loss Test
2025-12-13T11:08:43.737Z 🔗 Real-time endpoint: wss://e56qv7rp5nfq5jdpcjwlngii6m.appsync-realtime-api.eu-north-1.amazonaws.com/graphql
2025-12-13T11:08:43.737Z 🔗 GraphQL endpoint: https://e56qv7rp5nfq5jdpcjwlngii6m.appsync-api.eu-north-1.amazonaws.com/graphql
2025-12-13T11:08:43.737Z 🔑 API Key: da2-lr5qmb...
2025-12-13T11:08:43.737Z 🔌 Connecting to WebSocket...
2025-12-13T11:08:44.131Z 📤 WebSocket connected
2025-12-13T11:08:44.131Z 📤 Sending connection_init...
2025-12-13T11:08:44.205Z 📥 Received message: {"type":"connection_ack","payload":{"connectionTimeoutMs":300000}}
2025-12-13T11:08:44.205Z 📥 Received connection_ack
2025-12-13T11:08:44.206Z 📤 Sending subscription start (ID: 70aed2a0-7e1c-47a4-86f1-74cbc1038289)...
2025-12-13T11:08:44.206Z 📥 Received message: {"type":"ka"}
2025-12-13T11:08:44.388Z 📥 Received message: {"id":"70aed2a0-7e1c-47a4-86f1-74cbc1038289","type":"start_ack"}
2025-12-13T11:08:44.389Z 📥 Received start_ack (ID: 70aed2a0-7e1c-47a4-86f1-74cbc1038289)
2025-12-13T11:08:44.389Z 📤 Sending mutation with message: Test message - 1765624124389...
2025-12-13T11:08:44.640Z 📥 Mutation response: {"data":{"echoMessage":"Test message - 1765624124389"}}
2025-12-13T11:08:44.724Z 📥 Received message: {"id":"70aed2a0-7e1c-47a4-86f1-74cbc1038289","type":"data","payload":{"data":{"onEchoMessage":"Test message - 1765624124389"}}}
2025-12-13T11:08:44.724Z 📥 Received subscription event: {"data":{"onEchoMessage":"Test message - 1765624124389"}}
2025-12-13T11:08:44.814Z 📥 Received message: {"id":"70aed2a0-7e1c-47a4-86f1-74cbc1038289","type":"complete"}
2025-12-13T11:08:45.727Z ✅ Test completed successfully - event received
Exit code: 0
```

Then at some point the `data` event is missing, stalling the process (sometimes it can take 2-5 minutes):

```
2025-12-13T11:08:46.840Z 🧪 AppSync Subscription Event Loss Test
2025-12-13T11:08:46.844Z 🔗 Real-time endpoint: wss://e56qv7rp5nfq5jdpcjwlngii6m.appsync-realtime-api.eu-north-1.amazonaws.com/graphql
2025-12-13T11:08:46.845Z 🔗 GraphQL endpoint: https://e56qv7rp5nfq5jdpcjwlngii6m.appsync-api.eu-north-1.amazonaws.com/graphql
2025-12-13T11:08:46.845Z 🔑 API Key: da2-lr5qmb...
2025-12-13T11:08:46.845Z 🔌 Connecting to WebSocket...
2025-12-13T11:08:47.265Z 📤 WebSocket connected
2025-12-13T11:08:47.265Z 📤 Sending connection_init...
2025-12-13T11:08:47.351Z 📥 Received message: {"type":"connection_ack","payload":{"connectionTimeoutMs":300000}}
2025-12-13T11:08:47.352Z 📥 Received connection_ack
2025-12-13T11:08:47.352Z 📤 Sending subscription start (ID: 9fa7e46e-e5b5-4aa8-9a47-5551fcfde23f)...
2025-12-13T11:08:47.353Z 📥 Received message: {"type":"ka"}
2025-12-13T11:08:47.517Z 📥 Received message: {"id":"9fa7e46e-e5b5-4aa8-9a47-5551fcfde23f","type":"start_ack"}
2025-12-13T11:08:47.517Z 📥 Received start_ack (ID: 9fa7e46e-e5b5-4aa8-9a47-5551fcfde23f)
2025-12-13T11:08:47.517Z 📤 Sending mutation with message: Test message - 1765624127517...
2025-12-13T11:08:47.799Z 📥 Mutation response: {"data":{"echoMessage":"Test message - 1765624127517"}}
2025-12-13T11:09:47.337Z 📥 Received message: {"type":"ka"}
```

A separate subscription shows that the event was indeed dispatched:

```
{
  "data": {
    "onEchoMessage": "Test message - 1765624127517"
  }
}
```

## Remarks

Was made using Devstral 2
