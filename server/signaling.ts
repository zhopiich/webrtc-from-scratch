import type { RawData } from 'ws'
import { randomUUID } from 'node:crypto'
import { createServer } from 'node:http'
import process from 'node:process'
import { WebSocket, WebSocketServer } from 'ws'

interface Client {
  id: string
  roomId: string | null
  socket: WebSocket
}

interface JoinMessage {
  type: 'join'
  roomId: string
}

type RelayMessage
  = | { type: 'offer', sdp: unknown }
    | { type: 'answer', sdp: unknown }
    | { type: 'ice-candidate', candidate: unknown }

type ClientMessage = JoinMessage | RelayMessage

type ServerMessage
  = | { type: 'room-joined', roomId: string }
    | { type: 'peer-joined' }
    | { type: 'offer', sdp: unknown }
    | { type: 'answer', sdp: unknown }
    | { type: 'ice-candidate', candidate: unknown }
    | { type: 'peer-left' }
    | { type: 'room-full' }
    | { type: 'error', message: string }

const port = Number(process.env.PORT ?? 3001)
const rooms = new Map<string, Set<Client>>()
const server = createServer((request, response) => {
  if (request.url === '/health') {
    response.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' })
    response.end('ok\n')
    return
  }

  response.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' })
  response.end('WebRTC signaling server\n')
})

function createClient(socket: WebSocket): Client {
  return {
    id: randomUUID(),
    roomId: null,
    socket,
  }
}

function send(client: Client, message: ServerMessage): void {
  if (client.socket.readyState === WebSocket.OPEN) {
    client.socket.send(JSON.stringify(message))
  }
}

function sendError(client: Client, message: string): void {
  send(client, { type: 'error', message })
}

function getPeers(client: Client): Client[] {
  if (!client.roomId) {
    return []
  }

  const room = rooms.get(client.roomId)
  if (!room) {
    return []
  }

  return [...room].filter(peer => peer !== client)
}

function relayToPeers(client: Client, message: RelayMessage): void {
  for (const peer of getPeers(client)) {
    send(peer, message)
  }
}

function joinRoom(client: Client, roomId: string): void {
  const normalizedRoomId = roomId.trim()

  if (!normalizedRoomId) {
    sendError(client, 'Room id is required.')
    return
  }

  const existingRoom = rooms.get(normalizedRoomId) ?? new Set<Client>()

  if (existingRoom.size >= 2) {
    send(client, { type: 'room-full' })
    return
  }

  client.roomId = normalizedRoomId
  existingRoom.add(client)
  rooms.set(normalizedRoomId, existingRoom)

  send(client, { type: 'room-joined', roomId: normalizedRoomId })

  if (existingRoom.size === 2) {
    for (const peer of existingRoom) {
      if (peer !== client) {
        send(peer, { type: 'peer-joined' })
      }
    }
  }
}

function leaveRoom(client: Client): void {
  if (!client.roomId) {
    return
  }

  const room = rooms.get(client.roomId)
  if (!room) {
    client.roomId = null
    return
  }

  room.delete(client)

  for (const peer of room) {
    send(peer, { type: 'peer-left' })
  }

  if (room.size === 0) {
    rooms.delete(client.roomId)
  }

  client.roomId = null
}

function parseMessage(raw: RawData): ClientMessage | null {
  try {
    const message = JSON.parse(raw.toString()) as ClientMessage

    if (message.type === 'join' && typeof message.roomId === 'string') {
      return message
    }

    if (message.type === 'offer' || message.type === 'answer' || message.type === 'ice-candidate') {
      return message
    }

    return null
  }
  catch {
    return null
  }
}

const wss = new WebSocketServer({ server })

wss.on('connection', (socket) => {
  const client = createClient(socket)

  socket.on('message', (raw) => {
    const message = parseMessage(raw)

    if (!message) {
      sendError(client, 'Invalid signaling message.')
      return
    }

    if (message.type === 'join') {
      joinRoom(client, message.roomId)
      return
    }

    if (!client.roomId) {
      sendError(client, 'Join a room before sending signaling messages.')
      return
    }

    relayToPeers(client, message)
  })

  socket.on('close', () => {
    leaveRoom(client)
  })

  socket.on('error', () => {
    leaveRoom(client)
  })
})

server.listen(port, '0.0.0.0', () => {
  process.stdout.write(`Signaling server listening on ws://0.0.0.0:${port}\n`)
})
