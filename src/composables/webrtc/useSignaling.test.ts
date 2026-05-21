import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSignaling } from './useSignaling'

class FakeWebSocket {
  static OPEN = 1
  static instances: FakeWebSocket[] = []

  onclose: (() => void) | null = null
  onerror: (() => void) | null = null
  onmessage: ((event: MessageEvent<string>) => void) | null = null
  onopen: (() => void) | null = null
  readyState = 0
  sentMessages: string[] = []
  wasClosed = false

  constructor(public readonly url: string) {
    FakeWebSocket.instances.push(this)
  }

  close(): void {
    this.wasClosed = true
    this.readyState = 3
    this.onclose?.()
  }

  open(): void {
    this.readyState = FakeWebSocket.OPEN
    this.onopen?.()
  }

  send(message: string): void {
    this.sentMessages.push(message)
  }
}

describe('useSignaling', () => {
  const originalWebSocket = globalThis.WebSocket

  beforeEach(() => {
    FakeWebSocket.instances.length = 0
    vi.useFakeTimers()
    vi.stubGlobal('WebSocket', FakeWebSocket)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    globalThis.WebSocket = originalWebSocket
  })

  it('reconnects and rejoins the room when the socket closes unexpectedly', async () => {
    const signaling = useSignaling({
      url: 'ws://localhost:3001',
      onMessage: vi.fn(),
      onError: vi.fn(),
      reconnectDelayMs: 100,
    })

    const connectPromise = signaling.connectSignaling('demo-room')
    FakeWebSocket.instances[0]!.open()
    await connectPromise

    FakeWebSocket.instances[0]!.close()

    expect(signaling.signalingState.value).toBe('reconnecting')

    await vi.advanceTimersByTimeAsync(100)
    FakeWebSocket.instances[1]!.open()

    expect(FakeWebSocket.instances).toHaveLength(2)
    expect(signaling.signalingState.value).toBe('connected')
    expect(FakeWebSocket.instances[1]!.sentMessages).toEqual([
      JSON.stringify({ type: 'join', roomId: 'demo-room' }),
    ])
  })

  it('does not reconnect after signaling is closed manually', async () => {
    const signaling = useSignaling({
      url: 'ws://localhost:3001',
      onMessage: vi.fn(),
      onError: vi.fn(),
      reconnectDelayMs: 100,
    })

    const connectPromise = signaling.connectSignaling('demo-room')
    FakeWebSocket.instances[0]!.open()
    await connectPromise

    signaling.closeSignaling()
    await vi.advanceTimersByTimeAsync(100)

    expect(FakeWebSocket.instances).toHaveLength(1)
    expect(FakeWebSocket.instances[0]!.wasClosed).toBe(true)
    expect(signaling.signalingState.value).toBe('idle')
  })
})
