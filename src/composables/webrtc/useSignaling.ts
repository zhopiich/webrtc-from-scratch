import type { ClientMessage, ServerMessage, SignalingState } from './types'
import { ref } from 'vue'

interface UseSignalingOptions {
  url: string
  onMessage: (message: ServerMessage) => Promise<void>
  onError: (message: string) => void
}

export function useSignaling({ url, onMessage, onError }: UseSignalingOptions) {
  const signalingState = ref<SignalingState>('idle')

  let socket: WebSocket | null = null

  function sendSignal(message: ClientMessage): boolean {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      onError('Signaling server is not connected.')
      return false
    }

    socket.send(JSON.stringify(message))
    return true
  }

  function connectSignaling(roomId: string): Promise<void> {
    signalingState.value = 'connecting'

    return new Promise((resolve, reject) => {
      socket = new WebSocket(url)

      socket.onopen = () => {
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
        signalingState.value = 'error'
        onError('Could not connect to signaling server.')
        reject(new Error('Could not connect to signaling server.'))
      }

      socket.onclose = () => {
        signalingState.value = 'closed'
      }
    })
  }

  function closeSignaling(): void {
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
