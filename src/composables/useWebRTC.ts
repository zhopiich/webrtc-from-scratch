import type { ServerMessage } from './webrtc/types'
import { ref } from 'vue'
import { useDataChannel } from './webrtc/useDataChannel'
import { useLocalMedia } from './webrtc/useLocalMedia'
import { useSignaling } from './webrtc/useSignaling'
import { useWebRTCStats } from './webrtc/useWebRTCStats'

export type { WebRTCStats } from './webrtc/types'

const signalingUrl = import.meta.env.VITE_SIGNALING_URL || 'ws://localhost:3001'

export function useWebRTC() {
  const remoteStream = ref<MediaStream | null>(null)
  const roomId = ref('')
  const isJoined = ref(false)
  const connectionState = ref<RTCPeerConnectionState>('new')
  const iceConnectionState = ref<RTCIceConnectionState>('new')
  const iceGatheringState = ref<RTCIceGatheringState>('new')
  const error = ref('')

  let peerConnection: RTCPeerConnection | null = null
  let pendingIceCandidates: RTCIceCandidateInit[] = []

  function setError(message: string): void {
    error.value = message
  }

  function getPeerConnection(): RTCPeerConnection | null {
    return peerConnection
  }

  const statsControls = useWebRTCStats({ getPeerConnection })

  const dataChannelControls = useDataChannel({
    onError: setError,
  })

  const localMedia = useLocalMedia({
    getPeerConnection,
    onStreamStarted: async () => {
      if (!peerConnection) {
        return
      }

      addLocalTracks(peerConnection)
      await createAndSendOffer()
    },
    onError: setError,
  })

  function addLocalTracks(pc: RTCPeerConnection): void {
    if (!localMedia.localStream.value) {
      return
    }

    for (const track of localMedia.localStream.value.getTracks()) {
      pc.addTrack(track, localMedia.localStream.value)
    }
  }

  const signaling = useSignaling({
    url: signalingUrl,
    onMessage: handleServerMessage,
    onError: setError,
  })

  function createPeerConnection(): RTCPeerConnection {
    if (peerConnection) {
      return peerConnection
    }

    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
      ],
    })

    peerConnection = pc
    connectionState.value = pc.connectionState
    iceConnectionState.value = pc.iceConnectionState
    iceGatheringState.value = pc.iceGatheringState
    remoteStream.value = new MediaStream()

    pc.onconnectionstatechange = () => {
      connectionState.value = pc.connectionState
    }

    pc.oniceconnectionstatechange = () => {
      iceConnectionState.value = pc.iceConnectionState
    }

    pc.onicegatheringstatechange = () => {
      iceGatheringState.value = pc.iceGatheringState
    }

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        signaling.sendSignal({
          type: 'ice-candidate',
          candidate: event.candidate.toJSON(),
        })
      }
    }

    pc.ontrack = (event) => {
      if (!remoteStream.value) {
        remoteStream.value = new MediaStream()
      }

      for (const track of event.streams[0]?.getTracks() ?? [event.track]) {
        remoteStream.value.addTrack(track)
      }
    }

    pc.ondatachannel = (event) => {
      dataChannelControls.setupDataChannel(event.channel)
    }

    addLocalTracks(pc)
    statsControls.startStatsPolling()

    return pc
  }

  async function createAndSendOffer(): Promise<void> {
    const pc = createPeerConnection()

    if (!dataChannelControls.hasDataChannel()) {
      dataChannelControls.setupDataChannel(pc.createDataChannel('chat'))
    }

    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)

    signaling.sendSignal({
      type: 'offer',
      sdp: offer,
    })
  }

  async function flushPendingIceCandidates(): Promise<void> {
    if (!peerConnection || !peerConnection.remoteDescription) {
      return
    }

    for (const candidate of pendingIceCandidates) {
      await peerConnection.addIceCandidate(candidate)
    }

    pendingIceCandidates = []
  }

  async function handleOffer(sdp: RTCSessionDescriptionInit): Promise<void> {
    const pc = createPeerConnection()

    await pc.setRemoteDescription(sdp)
    await flushPendingIceCandidates()

    const answer = await pc.createAnswer()
    await pc.setLocalDescription(answer)

    signaling.sendSignal({
      type: 'answer',
      sdp: answer,
    })
  }

  async function handleAnswer(sdp: RTCSessionDescriptionInit): Promise<void> {
    if (!peerConnection) {
      return
    }

    await peerConnection.setRemoteDescription(sdp)
    await flushPendingIceCandidates()
  }

  async function handleIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    if (!peerConnection || !peerConnection.remoteDescription) {
      pendingIceCandidates.push(candidate)
      return
    }

    await peerConnection.addIceCandidate(candidate)
  }

  function closePeerConnection(): void {
    dataChannelControls.closeDataChannel()

    peerConnection?.close()
    peerConnection = null
    connectionState.value = 'closed'
    iceConnectionState.value = 'closed'
    iceGatheringState.value = 'complete'
    remoteStream.value = null
    pendingIceCandidates = []
    statsControls.resetStats()
  }

  function hangUp(): void {
    closePeerConnection()
    signaling.closeSignaling()
    localMedia.stopLocalMedia()

    roomId.value = ''
    isJoined.value = false
    connectionState.value = 'new'
    iceConnectionState.value = 'new'
    iceGatheringState.value = 'new'
    dataChannelControls.resetDataChannel()
  }

  async function handleServerMessage(message: ServerMessage): Promise<void> {
    if (message.type === 'room-joined') {
      roomId.value = message.roomId
      isJoined.value = true
      return
    }

    if (message.type === 'peer-joined') {
      await createAndSendOffer()
      return
    }

    if (message.type === 'offer') {
      await handleOffer(message.sdp)
      return
    }

    if (message.type === 'answer') {
      await handleAnswer(message.sdp)
      return
    }

    if (message.type === 'ice-candidate') {
      await handleIceCandidate(message.candidate)
      return
    }

    if (message.type === 'peer-left') {
      closePeerConnection()
      error.value = 'Peer left the room.'
      return
    }

    if (message.type === 'room-full') {
      error.value = 'Room is full.'
      hangUp()
      return
    }

    if (message.type === 'error') {
      error.value = message.message
    }
  }

  async function joinRoom(nextRoomId: string): Promise<void> {
    error.value = ''
    const normalizedRoomId = nextRoomId.trim()

    if (!normalizedRoomId) {
      error.value = 'Room id is required.'
      return
    }

    try {
      await signaling.connectSignaling(normalizedRoomId)
    }
    catch (caughtError) {
      error.value = caughtError instanceof Error ? caughtError.message : 'Could not join room.'
      hangUp()
    }
  }

  async function startLocalMedia(): Promise<void> {
    error.value = ''
    await localMedia.startLocalMedia()
  }

  async function switchMediaDevice(kind: 'audioinput' | 'videoinput', deviceId: string): Promise<void> {
    error.value = ''
    await localMedia.switchMediaDevice(kind, deviceId)
  }

  const media = {
    localStream: localMedia.localStream,
    remoteStream,
    audioInputDevices: localMedia.audioInputDevices,
    videoInputDevices: localMedia.videoInputDevices,
    selectedAudioInputId: localMedia.selectedAudioInputId,
    selectedVideoInputId: localMedia.selectedVideoInputId,
    isAudioMuted: localMedia.isAudioMuted,
    isVideoOff: localMedia.isVideoOff,
    loadDevices: localMedia.loadDevices,
    startLocalMedia,
    switchMediaDevice,
    toggleAudioMuted: localMedia.toggleAudioMuted,
    toggleVideoOff: localMedia.toggleVideoOff,
  }
  const signalingState = {
    roomId,
    isJoined,
    signalingState: signaling.signalingState,
    joinRoom,
  }
  const peer = {
    connectionState,
    iceConnectionState,
    iceGatheringState,
  }
  const chat = {
    dataChannelState: dataChannelControls.dataChannelState,
    messages: dataChannelControls.messages,
    canSendMessage: dataChannelControls.canSendMessage,
    sendMessage: dataChannelControls.sendMessage,
  }
  const stats = {
    current: statsControls.stats,
  }

  return {
    media,
    signaling: signalingState,
    peer,
    chat,
    stats,
    error,
    hangUp,
  }
}
