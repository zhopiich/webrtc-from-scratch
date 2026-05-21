import type { ServerMessage } from './webrtc/types'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useWebRTC } from './useWebRTC'

class FakeWebSocket {
  static OPEN = 1
  static instances: FakeWebSocket[] = []

  onclose: (() => void) | null = null
  onerror: (() => void) | null = null
  onmessage: ((event: MessageEvent<string>) => unknown) | null = null
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

  async receive(message: ServerMessage): Promise<void> {
    await this.onmessage?.({
      data: JSON.stringify(message),
    } as MessageEvent<string>)
  }
}

class FakeMediaStream {
  tracks: MediaStreamTrack[] = []

  addTrack(track: MediaStreamTrack): void {
    this.tracks.push(track)
  }
}

class FakeDataChannel {
  onclose: (() => void) | null = null
  onerror: (() => void) | null = null
  onmessage: ((event: MessageEvent<string>) => void) | null = null
  onopen: (() => void) | null = null
  readyState = 'connecting'

  close(): void {
    this.readyState = 'closed'
    this.onclose?.()
  }

  send = vi.fn()
}

class FakeRTCPeerConnection {
  static instances: FakeRTCPeerConnection[] = []

  connectionState: RTCPeerConnectionState = 'new'
  iceConnectionState: RTCIceConnectionState = 'new'
  iceGatheringState: RTCIceGatheringState = 'new'
  signalingState: RTCSignalingState = 'stable'
  remoteDescription: RTCSessionDescriptionInit | null = null
  localDescription: RTCSessionDescriptionInit | null = null
  createdOffers: RTCOfferOptions[] = []
  onconnectionstatechange: (() => void) | null = null
  ondatachannel: ((event: RTCDataChannelEvent) => void) | null = null
  onicecandidate: ((event: RTCPeerConnectionIceEvent) => void) | null = null
  oniceconnectionstatechange: (() => void) | null = null
  onicegatheringstatechange: (() => void) | null = null
  ontrack: ((event: RTCTrackEvent) => void) | null = null

  addIceCandidate = vi.fn()
  addTrack = vi.fn()
  restartIce = vi.fn()

  constructor(public readonly configuration?: RTCConfiguration) {
    FakeRTCPeerConnection.instances.push(this)
  }

  close(): void {
    this.connectionState = 'closed'
    this.iceConnectionState = 'closed'
  }

  createDataChannel(): RTCDataChannel {
    return new FakeDataChannel() as unknown as RTCDataChannel
  }

  async createOffer(options?: RTCOfferOptions): Promise<RTCSessionDescriptionInit> {
    this.createdOffers.push(options ?? {})
    return { type: 'offer', sdp: 'offer-sdp' }
  }

  async createAnswer(): Promise<RTCSessionDescriptionInit> {
    return { type: 'answer', sdp: 'answer-sdp' }
  }

  async setLocalDescription(description: RTCSessionDescriptionInit): Promise<void> {
    this.localDescription = description
  }

  async setRemoteDescription(description: RTCSessionDescriptionInit): Promise<void> {
    this.remoteDescription = description
  }

  async getStats(): Promise<RTCStatsReport> {
    return new Map() as unknown as RTCStatsReport
  }

  changeIceConnectionState(state: RTCIceConnectionState): void {
    this.iceConnectionState = state
    this.oniceconnectionstatechange?.()
  }
}

function createTrack() {
  return {
    enabled: true,
    kind: 'audio',
    stop: vi.fn(),
  } as unknown as MediaStreamTrack
}

function createStream(tracks: MediaStreamTrack[]) {
  return {
    getTracks: () => tracks,
    getAudioTracks: () => tracks.filter(track => track.kind === 'audio'),
    getVideoTracks: () => tracks.filter(track => track.kind === 'video'),
  } as unknown as MediaStream
}

describe('useWebRTC', () => {
  const originalWebSocket = globalThis.WebSocket
  const originalRTCPeerConnection = globalThis.RTCPeerConnection
  const originalMediaStream = globalThis.MediaStream
  const originalMediaDevices = navigator.mediaDevices

  beforeEach(() => {
    FakeWebSocket.instances.length = 0
    FakeRTCPeerConnection.instances.length = 0
    vi.stubGlobal('WebSocket', FakeWebSocket)
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        enumerateDevices: vi.fn().mockResolvedValue([]),
        getUserMedia: vi.fn(),
      },
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: originalMediaDevices,
    })
    globalThis.WebSocket = originalWebSocket
    globalThis.RTCPeerConnection = originalRTCPeerConnection
    globalThis.MediaStream = originalMediaStream
  })

  it('does not request media or connect signaling when room id is empty', async () => {
    const rtc = useWebRTC()

    await rtc.signaling.joinRoom('   ')

    expect(rtc.error.value).toBe('Room id is required.')
    expect(navigator.mediaDevices.getUserMedia).not.toHaveBeenCalled()
    expect(FakeWebSocket.instances).toHaveLength(0)
  })

  it('joins signaling without requesting camera or microphone', async () => {
    const rtc = useWebRTC()

    const joinPromise = rtc.signaling.joinRoom('demo-room')
    await vi.waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1))
    FakeWebSocket.instances[0]!.open()
    await joinPromise

    expect(navigator.mediaDevices.getUserMedia).not.toHaveBeenCalled()
    expect(JSON.parse(FakeWebSocket.instances[0]!.sentMessages[0]!)).toMatchObject({
      type: 'join',
      roomId: 'demo-room',
      clientId: expect.any(String),
    })
    expect(rtc.signaling.signalingState.value).toBe('connected')
  })

  it('starts local media only when requested', async () => {
    const track = createTrack()
    vi.mocked(navigator.mediaDevices.getUserMedia).mockResolvedValue(createStream([track]))
    const rtc = useWebRTC()

    await rtc.media.startLocalMedia()

    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({
      video: true,
      audio: true,
    })
    expect(rtc.media.localStream.value).not.toBeNull()
  })

  it('toggles audio and video tracks without stopping media', async () => {
    const audioTrack = createTrack()
    const videoTrack = {
      ...createTrack(),
      kind: 'video',
    } as unknown as MediaStreamTrack
    vi.mocked(navigator.mediaDevices.getUserMedia).mockResolvedValue(createStream([audioTrack, videoTrack]))
    const rtc = useWebRTC()

    await rtc.media.startLocalMedia()
    rtc.media.toggleAudioMuted()
    rtc.media.toggleVideoOff()

    expect(audioTrack.enabled).toBe(false)
    expect(videoTrack.enabled).toBe(false)
    expect(rtc.media.isAudioMuted.value).toBe(true)
    expect(rtc.media.isVideoOff.value).toBe(true)
    expect(audioTrack.stop).not.toHaveBeenCalled()
    expect(videoTrack.stop).not.toHaveBeenCalled()
  })

  it('stops local tracks and closes signaling when hanging up after join', async () => {
    const track = createTrack()
    vi.mocked(navigator.mediaDevices.getUserMedia).mockResolvedValue(createStream([track]))
    const rtc = useWebRTC()

    await rtc.media.startLocalMedia()
    const joinPromise = rtc.signaling.joinRoom('demo-room')
    await vi.waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1))
    FakeWebSocket.instances[0]!.open()
    await joinPromise

    rtc.hangUp()

    expect(track.stop).toHaveBeenCalledOnce()
    expect(FakeWebSocket.instances[0]!.wasClosed).toBe(true)
    expect(rtc.media.localStream.value).toBeNull()
    expect(rtc.signaling.roomId.value).toBe('')
    expect(rtc.signaling.isJoined.value).toBe(false)
    expect(rtc.signaling.signalingState.value).toBe('idle')
  })

  it('delegates ICE failure recovery and sends a restart offer', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('RTCPeerConnection', FakeRTCPeerConnection)
    vi.stubGlobal('MediaStream', FakeMediaStream)
    const rtc = useWebRTC()

    const joinPromise = rtc.signaling.joinRoom('demo-room')
    await vi.waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1))
    FakeWebSocket.instances[0]!.open()
    await joinPromise
    await FakeWebSocket.instances[0]!.receive({ type: 'peer-joined' })

    const peerConnection = FakeRTCPeerConnection.instances[0]!

    peerConnection.changeIceConnectionState('failed')
    await vi.advanceTimersByTimeAsync(0)

    expect(peerConnection.restartIce).toHaveBeenCalledOnce()
    expect(peerConnection.createdOffers).toEqual([
      {},
      { iceRestart: true },
    ])
    expect(JSON.parse(FakeWebSocket.instances[0]!.sentMessages.at(-1)!)).toEqual({
      type: 'offer',
      sdp: { type: 'offer', sdp: 'offer-sdp' },
    })

    rtc.hangUp()
    vi.useRealTimers()
  })
})
