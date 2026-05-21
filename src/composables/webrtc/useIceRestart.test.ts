import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useIceRestart } from './useIceRestart'

class FakeRTCPeerConnection {
  signalingState: RTCSignalingState = 'stable'
  createdOffers: RTCOfferOptions[] = []
  localDescription: RTCSessionDescriptionInit | null = null

  restartIce = vi.fn()

  async createOffer(options?: RTCOfferOptions): Promise<RTCSessionDescriptionInit> {
    this.createdOffers.push(options ?? {})
    return { type: 'offer', sdp: 'offer-sdp' }
  }

  async setLocalDescription(description: RTCSessionDescriptionInit): Promise<void> {
    this.localDescription = description
  }
}

describe('useIceRestart', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('restarts ICE immediately when ICE fails', async () => {
    const peerConnection = new FakeRTCPeerConnection()
    const sendOffer = vi.fn()
    const iceRestart = useIceRestart({
      getPeerConnection: () => peerConnection as unknown as RTCPeerConnection,
      sendOffer,
      onError: vi.fn(),
    })

    iceRestart.handleIceConnectionStateChange('failed')
    await vi.advanceTimersByTimeAsync(0)

    expect(peerConnection.restartIce).toHaveBeenCalledOnce()
    expect(peerConnection.createdOffers).toEqual([{ iceRestart: true }])
    expect(peerConnection.localDescription).toEqual({ type: 'offer', sdp: 'offer-sdp' })
    expect(sendOffer).toHaveBeenCalledWith({ type: 'offer', sdp: 'offer-sdp' })
  })

  it('waits before restarting ICE when ICE is disconnected', async () => {
    const peerConnection = new FakeRTCPeerConnection()
    const sendOffer = vi.fn()
    const iceRestart = useIceRestart({
      getPeerConnection: () => peerConnection as unknown as RTCPeerConnection,
      sendOffer,
      onError: vi.fn(),
      disconnectedRestartDelayMs: 100,
    })

    iceRestart.handleIceConnectionStateChange('disconnected')
    await vi.advanceTimersByTimeAsync(99)

    expect(sendOffer).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1)

    expect(sendOffer).toHaveBeenCalledOnce()
  })

  it('cancels a delayed restart when ICE recovers', async () => {
    const peerConnection = new FakeRTCPeerConnection()
    const sendOffer = vi.fn()
    const iceRestart = useIceRestart({
      getPeerConnection: () => peerConnection as unknown as RTCPeerConnection,
      sendOffer,
      onError: vi.fn(),
      disconnectedRestartDelayMs: 100,
    })

    iceRestart.handleIceConnectionStateChange('disconnected')
    iceRestart.handleIceConnectionStateChange('connected')
    await vi.advanceTimersByTimeAsync(100)

    expect(sendOffer).not.toHaveBeenCalled()
  })

  it('reports an error after the maximum restart attempts', async () => {
    const peerConnection = new FakeRTCPeerConnection()
    const onError = vi.fn()
    const iceRestart = useIceRestart({
      getPeerConnection: () => peerConnection as unknown as RTCPeerConnection,
      sendOffer: vi.fn(),
      onError,
      maxRestartAttempts: 1,
    })

    iceRestart.handleIceConnectionStateChange('failed')
    await vi.advanceTimersByTimeAsync(0)
    iceRestart.handleIceConnectionStateChange('failed')
    await vi.advanceTimersByTimeAsync(0)

    expect(onError).toHaveBeenCalledWith('Could not recover peer connection.')
  })
})
