import { ref } from 'vue'

interface UseLocalMediaOptions {
  getPeerConnection: () => RTCPeerConnection | null
  onStreamStarted: () => Promise<void>
  onError: (message: string) => void
}

export function useLocalMedia({ getPeerConnection, onStreamStarted, onError }: UseLocalMediaOptions) {
  const localStream = ref<MediaStream | null>(null)
  const audioInputDevices = ref<MediaDeviceInfo[]>([])
  const videoInputDevices = ref<MediaDeviceInfo[]>([])
  const selectedAudioInputId = ref('')
  const selectedVideoInputId = ref('')
  const isAudioMuted = ref(false)
  const isVideoOff = ref(false)

  async function loadDevices(): Promise<void> {
    if (!navigator.mediaDevices?.enumerateDevices) {
      return
    }

    const devices = await navigator.mediaDevices.enumerateDevices()
    audioInputDevices.value = devices.filter(device => device.kind === 'audioinput')
    videoInputDevices.value = devices.filter(device => device.kind === 'videoinput')
  }

  function getMediaConstraints(): MediaStreamConstraints {
    return {
      video: selectedVideoInputId.value
        ? { deviceId: { exact: selectedVideoInputId.value } }
        : true,
      audio: selectedAudioInputId.value
        ? { deviceId: { exact: selectedAudioInputId.value } }
        : true,
    }
  }

  function applyTrackState(): void {
    for (const track of localStream.value?.getAudioTracks() ?? []) {
      track.enabled = !isAudioMuted.value
    }

    for (const track of localStream.value?.getVideoTracks() ?? []) {
      track.enabled = !isVideoOff.value
    }
  }

  async function startLocalMedia(): Promise<void> {
    if (localStream.value) {
      return
    }

    try {
      localStream.value = await navigator.mediaDevices.getUserMedia(getMediaConstraints())
      applyTrackState()
      await loadDevices()
      await onStreamStarted()
    }
    catch (caughtError) {
      onError(caughtError instanceof Error ? caughtError.message : 'Could not start camera or microphone.')
    }
  }

  async function switchMediaDevice(kind: 'audioinput' | 'videoinput', deviceId: string): Promise<void> {
    if (kind === 'audioinput') {
      selectedAudioInputId.value = deviceId
    }
    else {
      selectedVideoInputId.value = deviceId
    }

    if (!localStream.value) {
      return
    }

    try {
      const nextStream = await navigator.mediaDevices.getUserMedia(getMediaConstraints())
      const previousStream = localStream.value
      localStream.value = nextStream
      applyTrackState()

      for (const track of previousStream.getTracks()) {
        track.stop()
      }

      const peerConnection = getPeerConnection()

      if (peerConnection) {
        for (const sender of peerConnection.getSenders()) {
          const nextTrack = nextStream.getTracks().find(track => track.kind === sender.track?.kind)

          if (nextTrack) {
            await sender.replaceTrack(nextTrack)
          }
        }
      }
    }
    catch (caughtError) {
      onError(caughtError instanceof Error ? caughtError.message : 'Could not switch media device.')
    }
  }

  function toggleAudioMuted(): void {
    isAudioMuted.value = !isAudioMuted.value
    applyTrackState()
  }

  function toggleVideoOff(): void {
    isVideoOff.value = !isVideoOff.value
    applyTrackState()
  }

  function stopLocalMedia(): void {
    localStream.value?.getTracks().forEach(track => track.stop())
    localStream.value = null
    isAudioMuted.value = false
    isVideoOff.value = false
  }

  return {
    localStream,
    audioInputDevices,
    videoInputDevices,
    selectedAudioInputId,
    selectedVideoInputId,
    isAudioMuted,
    isVideoOff,
    loadDevices,
    startLocalMedia,
    switchMediaDevice,
    toggleAudioMuted,
    toggleVideoOff,
    stopLocalMedia,
  }
}
