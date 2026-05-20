# WebRTC 1-on-1 Video Chat Demo

## Features

- `getUserMedia` local camera and microphone
- `RTCPeerConnection` 1-on-1 audio/video
- WebSocket signaling server
- Room join
- Offer, answer, and ICE candidate exchange
- DataChannel text chat
- Hang up cleanup for media tracks and connections
- Connection state display

## Setup

```sh
pnpm install
cp .env.example .env
```

## Local Development

Start the signaling server:

```sh
pnpm dev:server
```

Start the Vue app:

```sh
pnpm dev
```

Open two browser tabs at:

```text
http://localhost:5173
```

Enter the same room id in both tabs.

## Environment

```text
VITE_SIGNALING_URL=ws://localhost:3001
```

For HTTPS deployments, use a secure WebSocket URL:

```text
VITE_SIGNALING_URL=wss://your-signaling.example.com
```

## GitHub Pages Deployment

The frontend deploys with GitHub Actions from `.github/workflows/deploy-pages.yml`.

Before deploying:

1. Deploy the signaling server to a host that supports WebSockets.
2. Copy its public WebSocket URL, for example:

   ```text
   wss://your-signaling-service.onrender.com
   ```

3. In GitHub, open repository settings and add an Actions repository variable:

   ```text
   Settings > Secrets and variables > Actions > Variables > New repository variable
   ```

   ```text
   Name: VITE_SIGNALING_URL
   Value: wss://your-signaling-service.onrender.com
   ```

4. Enable GitHub Pages with source set to GitHub Actions.

The workflow uses:

```text
BASE_PATH=/webrtc-from-scratch/
```

If the repository name changes, update `BASE_PATH` in `.github/workflows/deploy-pages.yml`.

## WebRTC Flow

1. Both clients join the same signaling room.
2. The first peer receives `peer-joined` and creates an offer.
3. The second peer receives the offer and creates an answer.
4. Both peers exchange ICE candidates through the signaling server.
5. Text chat uses a WebRTC DataChannel.
6. Users can enable local media with `Start media`.
7. Audio and video flow peer-to-peer through WebRTC after media starts.

## Verification

Run:

```sh
pnpm build
pnpm lint
```

Manual checks:

- Local video appears in both clients.
- Remote video appears in both clients.
- Joining without camera or microphone permission still enters the room.
- Peer connection reaches `connected`.
- DataChannel messages work in both directions.
- Hang up stops camera and microphone.
- A third client joining the same room receives `Room is full`.
