import type { ClientMessage, ServerMessage, SignalingState } from './types'
import { ref } from 'vue'

interface UseSignalingOptions {
  url: string
  onMessage: (message: ServerMessage) => Promise<void>
  onError: (message: string) => void
  reconnectDelayMs?: number
  maxReconnectAttempts?: number
}

export function useSignaling({
  url,
  onMessage,
  onError,
  reconnectDelayMs = 1000,
  maxReconnectAttempts = Number.POSITIVE_INFINITY,
}: UseSignalingOptions) {
  const signalingState = ref<SignalingState>('idle')

  let socket: WebSocket | null = null
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let joinedRoomId = ''
  let reconnectAttempts = 0
  let shouldReconnect = false

  function clearReconnectTimer(): void {
    if (!reconnectTimer) {
      return
    }

    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }

  function sendSignal(message: ClientMessage): boolean {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      onError('Signaling server is not connected.')
      return false
    }

    socket.send(JSON.stringify(message))
    return true
  }

  function scheduleReconnect(): void {
    if (!shouldReconnect || !joinedRoomId || reconnectTimer) {
      return
    }

    if (reconnectAttempts >= maxReconnectAttempts) {
      signalingState.value = 'error'
      onError('Could not reconnect to signaling server.')
      return
    }

    reconnectAttempts += 1
    signalingState.value = 'reconnecting'

    reconnectTimer = setTimeout(() => {
      reconnectTimer = null
      openSocket(joinedRoomId, true).catch(() => {
        scheduleReconnect()
      })
    }, reconnectDelayMs)
  }

  function openSocket(roomId: string, isReconnect: boolean): Promise<void> {
    signalingState.value = isReconnect ? 'reconnecting' : 'connecting'

    return new Promise((resolve, reject) => {
      let isSettled = false
      socket = new WebSocket(url)

      socket.onopen = () => {
        isSettled = true
        reconnectAttempts = 0
        signalingState.value = 'connected'
        sendSignal({ type: 'join', roomId })
        resolve()
      }

      socket.onmessage = async (event) => {
        try {
          await onMessage(JSON.parse(event.data) as ServerMessage)
        }
        catch {
          console.warn('Unknown signaling message:', event.data)
        }
      }

      socket.onerror = () => {
        if (!isReconnect) {
          signalingState.value = 'error'
          onError('Could not connect to signaling server.')
        }

        if (!isSettled) {
          isSettled = true
          reject(new Error('Could not connect to signaling server.'))
        }
      }

      socket.onclose = () => {
        socket = null

        if (!shouldReconnect) {
          signalingState.value = 'closed'
          return
        }

        scheduleReconnect()
      }
    })
  }

  async function connectSignaling(roomId: string): Promise<void> {
    clearReconnectTimer()
    joinedRoomId = roomId
    shouldReconnect = true
    reconnectAttempts = 0

    await openSocket(roomId, false)
  }

  function closeSignaling(): void {
    shouldReconnect = false
    joinedRoomId = ''
    reconnectAttempts = 0
    clearReconnectTimer()

    if (!socket) {
      signalingState.value = 'idle'
      return
    }

    socket.onopen = null
    socket.onmessage = null
    socket.onerror = null
    socket.onclose = null
    socket.close()
    socket = null
    signalingState.value = 'idle'
  }

  return {
    signalingState,
    sendSignal,
    connectSignaling,
    closeSignaling,
  }
}
