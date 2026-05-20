import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useWebRTC } from './useWebRTC'

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

function createTrack() {
  return {
    stop: vi.fn(),
  } as unknown as MediaStreamTrack
}

function createStream(tracks: MediaStreamTrack[]) {
  return {
    getTracks: () => tracks,
  } as unknown as MediaStream
}

describe('useWebRTC', () => {
  const originalWebSocket = globalThis.WebSocket
  const originalMediaDevices = navigator.mediaDevices

  beforeEach(() => {
    FakeWebSocket.instances.length = 0
    vi.stubGlobal('WebSocket', FakeWebSocket)
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: vi.fn(),
      },
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: originalMediaDevices,
    })
    globalThis.WebSocket = originalWebSocket
  })

  it('does not request media or connect signaling when room id is empty', async () => {
    const rtc = useWebRTC()

    await rtc.joinRoom('   ')

    expect(rtc.error.value).toBe('Room id is required.')
    expect(navigator.mediaDevices.getUserMedia).not.toHaveBeenCalled()
    expect(FakeWebSocket.instances).toHaveLength(0)
  })

  it('stops local tracks and closes signaling when hanging up after join', async () => {
    const track = createTrack()
    vi.mocked(navigator.mediaDevices.getUserMedia).mockResolvedValue(createStream([track]))
    const rtc = useWebRTC()

    const joinPromise = rtc.joinRoom('demo-room')
    await vi.waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1))
    FakeWebSocket.instances[0]!.open()
    await joinPromise

    rtc.hangUp()

    expect(track.stop).toHaveBeenCalledOnce()
    expect(FakeWebSocket.instances[0]!.wasClosed).toBe(true)
    expect(rtc.localStream.value).toBeNull()
    expect(rtc.roomId.value).toBe('')
    expect(rtc.isJoined.value).toBe(false)
    expect(rtc.signalingState.value).toBe('idle')
  })
})
