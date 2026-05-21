import { computed, ref } from 'vue'

interface ChatMessage {
  id: string
  from: 'local' | 'remote'
  text: string
}

type SignalingState = 'idle' | 'connecting' | 'connected' | 'closed' | 'error'
type DataChannelStatus = 'idle' | 'connecting' | 'open' | 'closed'

type ServerMessage
  = | { type: 'room-joined', roomId: string }
    | { type: 'peer-joined' }
    | { type: 'offer', sdp: RTCSessionDescriptionInit }
    | { type: 'answer', sdp: RTCSessionDescriptionInit }
    | { type: 'ice-candidate', candidate: RTCIceCandidateInit }
    | { type: 'peer-left' }
    | { type: 'room-full' }
    | { type: 'error', message: string }

type ClientMessage
  = | { type: 'join', roomId: string }
    | { type: 'offer', sdp: RTCSessionDescriptionInit }
    | { type: 'answer', sdp: RTCSessionDescriptionInit }
    | { type: 'ice-candidate', candidate: RTCIceCandidateInit }

const signalingUrl = import.meta.env.VITE_SIGNALING_URL || 'ws://localhost:3001'

export function useWebRTC() {
  const localStream = ref<MediaStream | null>(null)
  const remoteStream = ref<MediaStream | null>(null)
  const roomId = ref('')
  const isJoined = ref(false)
  const connectionState = ref<RTCPeerConnectionState>('new')
  const signalingState = ref<SignalingState>('idle')
  const dataChannelState = ref<DataChannelStatus>('idle')
  const messages = ref<ChatMessage[]>([])
  const error = ref('')
  const audioInputDevices = ref<MediaDeviceInfo[]>([])
  const videoInputDevices = ref<MediaDeviceInfo[]>([])
  const selectedAudioInputId = ref('')
  const selectedVideoInputId = ref('')
  const isAudioMuted = ref(false)
  const isVideoOff = ref(false)

  let socket: WebSocket | null = null
  let peerConnection: RTCPeerConnection | null = null
  let dataChannel: RTCDataChannel | null = null
  let pendingIceCandidates: RTCIceCandidateInit[] = []

  const canSendMessage = computed(() => dataChannelState.value === 'open')

  function sendSignal(message: ClientMessage): void {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      error.value = 'Signaling server is not connected.'
      return
    }

    socket.send(JSON.stringify(message))
  }

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
    error.value = ''

    if (localStream.value) {
      return
    }

    try {
      localStream.value = await navigator.mediaDevices.getUserMedia(getMediaConstraints())
      applyTrackState()
      await loadDevices()

      if (peerConnection) {
        addLocalTracks(peerConnection)
        await createAndSendOffer()
      }
    }
    catch (caughtError) {
      error.value = caughtError instanceof Error ? caughtError.message : 'Could not start camera or microphone.'
    }
  }

  async function switchMediaDevice(kind: 'audioinput' | 'videoinput', deviceId: string): Promise<void> {
    error.value = ''

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
      error.value = caughtError instanceof Error ? caughtError.message : 'Could not switch media device.'
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

  function addLocalTracks(pc: RTCPeerConnection): void {
    if (!localStream.value) {
      return
    }

    for (const track of localStream.value.getTracks()) {
      pc.addTrack(track, localStream.value)
    }
  }

  function setupDataChannel(channel: RTCDataChannel): void {
    dataChannel = channel
    dataChannelState.value = channel.readyState === 'open' ? 'open' : 'connecting'

    channel.onopen = () => {
      dataChannelState.value = 'open'
    }

    channel.onclose = () => {
      dataChannelState.value = 'closed'
    }

    channel.onerror = () => {
      error.value = 'DataChannel error.'
      dataChannelState.value = 'closed'
    }

    channel.onmessage = (event) => {
      messages.value.push({
        id: crypto.randomUUID(),
        from: 'remote',
        text: String(event.data),
      })
    }
  }

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
    remoteStream.value = new MediaStream()

    pc.onconnectionstatechange = () => {
      connectionState.value = pc.connectionState
    }

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        sendSignal({
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
      setupDataChannel(event.channel)
    }

    addLocalTracks(pc)

    return pc
  }

  async function createAndSendOffer(): Promise<void> {
    const pc = createPeerConnection()

    if (!dataChannel) {
      setupDataChannel(pc.createDataChannel('chat'))
    }

    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)

    sendSignal({
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

    sendSignal({
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
    dataChannel?.close()
    dataChannel = null
    dataChannelState.value = 'closed'

    peerConnection?.close()
    peerConnection = null
    connectionState.value = 'closed'
    remoteStream.value = null
    pendingIceCandidates = []
  }

  function hangUp(): void {
    closePeerConnection()

    if (socket) {
      socket.onopen = null
      socket.onmessage = null
      socket.onerror = null
      socket.onclose = null
      socket.close()
      socket = null
    }

    signalingState.value = 'idle'

    localStream.value?.getTracks().forEach(track => track.stop())
    localStream.value = null
    isAudioMuted.value = false
    isVideoOff.value = false

    roomId.value = ''
    isJoined.value = false
    connectionState.value = 'new'
    dataChannelState.value = 'idle'
    messages.value = []
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

  function connectSignaling(nextRoomId: string): Promise<void> {
    signalingState.value = 'connecting'

    return new Promise((resolve, reject) => {
      socket = new WebSocket(signalingUrl)

      socket.onopen = () => {
        signalingState.value = 'connected'
        sendSignal({ type: 'join', roomId: nextRoomId })
        resolve()
      }

      socket.onmessage = async (event) => {
        try {
          await handleServerMessage(JSON.parse(event.data) as ServerMessage)
        }
        catch {
          console.warn('Unknown signaling message:', event.data)
        }
      }

      socket.onerror = () => {
        signalingState.value = 'error'
        error.value = 'Could not connect to signaling server.'
        reject(new Error(error.value))
      }

      socket.onclose = () => {
        signalingState.value = 'closed'
      }
    })
  }

  async function joinRoom(nextRoomId: string): Promise<void> {
    error.value = ''
    const normalizedRoomId = nextRoomId.trim()

    if (!normalizedRoomId) {
      error.value = 'Room id is required.'
      return
    }

    try {
      await connectSignaling(normalizedRoomId)
    }
    catch (caughtError) {
      error.value = caughtError instanceof Error ? caughtError.message : 'Could not join room.'
      hangUp()
    }
  }

  function sendMessage(text: string): void {
    const trimmedText = text.trim()

    if (!trimmedText || !dataChannel || dataChannel.readyState !== 'open') {
      return
    }

    dataChannel.send(trimmedText)
    messages.value.push({
      id: crypto.randomUUID(),
      from: 'local',
      text: trimmedText,
    })
  }

  return {
    localStream,
    remoteStream,
    roomId,
    isJoined,
    connectionState,
    signalingState,
    dataChannelState,
    messages,
    error,
    audioInputDevices,
    videoInputDevices,
    selectedAudioInputId,
    selectedVideoInputId,
    isAudioMuted,
    isVideoOff,
    canSendMessage,
    loadDevices,
    startLocalMedia,
    switchMediaDevice,
    toggleAudioMuted,
    toggleVideoOff,
    joinRoom,
    sendMessage,
    hangUp,
  }
}
