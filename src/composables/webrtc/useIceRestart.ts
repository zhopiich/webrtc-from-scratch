interface UseIceRestartOptions {
  getPeerConnection: () => RTCPeerConnection | null
  sendOffer: (offer: RTCSessionDescriptionInit) => void
  onError: (message: string) => void
  disconnectedRestartDelayMs?: number
  maxRestartAttempts?: number
}

export function useIceRestart({
  getPeerConnection,
  sendOffer,
  onError,
  disconnectedRestartDelayMs = 3000,
  maxRestartAttempts = 3,
}: UseIceRestartOptions) {
  let restartTimer: ReturnType<typeof setTimeout> | null = null
  let restartAttempts = 0
  let isRestarting = false

  function clearRestartTimer(): void {
    if (!restartTimer) {
      return
    }

    clearTimeout(restartTimer)
    restartTimer = null
  }

  function resetIceRestart(): void {
    clearRestartTimer()
    restartAttempts = 0
    isRestarting = false
  }

  function handleIceConnectionStateChange(state: RTCIceConnectionState): void {
    if (state === 'failed') {
      scheduleIceRestart(0)
      return
    }

    if (state === 'disconnected') {
      scheduleIceRestart(disconnectedRestartDelayMs)
      return
    }

    if (state === 'connected' || state === 'completed') {
      resetIceRestart()
    }
  }

  function scheduleIceRestart(delayMs: number): void {
    if (restartTimer || isRestarting) {
      return
    }

    restartTimer = setTimeout(() => {
      restartTimer = null
      restartIce().catch((caughtError) => {
        onError(caughtError instanceof Error ? caughtError.message : 'Could not restart ICE.')
      })
    }, delayMs)
  }

  async function restartIce(): Promise<void> {
    const peerConnection = getPeerConnection()

    if (!peerConnection || peerConnection.signalingState !== 'stable') {
      return
    }

    if (restartAttempts >= maxRestartAttempts) {
      onError('Could not recover peer connection.')
      return
    }

    isRestarting = true
    restartAttempts += 1

    try {
      peerConnection.restartIce?.()
      const offer = await peerConnection.createOffer({ iceRestart: true })
      await peerConnection.setLocalDescription(offer)
      sendOffer(offer)
    }
    finally {
      isRestarting = false
    }
  }

  return {
    handleIceConnectionStateChange,
    resetIceRestart,
  }
}
