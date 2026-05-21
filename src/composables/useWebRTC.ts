import { computed, ref } from 'vue'

interface ChatMessage {
  id: string
  from: 'local' | 'remote'
  text: string
}

export interface WebRTCStats {
  selectedCandidatePair: string
  localCandidate: string
  remoteCandidate: string
  roundTripTimeMs: number | null
  availableOutgoingBitrateKbps: number | null
  outboundVideoBitrateKbps: number | null
  inboundVideoBitrateKbps: number | null
  packetsLost: number | null
  packetLossPercent: number | null
  framesPerSecond: number | null
  videoCodec: string
}

type SignalingState = 'idle' | 'connecting' | 'connected' | 'closed' | 'error'
type DataChannelStatus = 'idle' | 'connecting' | 'open' | 'closed'
type StatsRecord = RTCStats & Record<string, unknown>

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

const emptyStats: WebRTCStats = {
  selectedCandidatePair: 'unknown',
  localCandidate: 'unknown',
  remoteCandidate: 'unknown',
  roundTripTimeMs: null,
  availableOutgoingBitrateKbps: null,
  outboundVideoBitrateKbps: null,
  inboundVideoBitrateKbps: null,
  packetsLost: null,
  packetLossPercent: null,
  framesPerSecond: null,
  videoCodec: 'unknown',
}

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
  const iceConnectionState = ref<RTCIceConnectionState>('new')
  const iceGatheringState = ref<RTCIceGatheringState>('new')
  const stats = ref<WebRTCStats>({ ...emptyStats })

  let socket: WebSocket | null = null
  let peerConnection: RTCPeerConnection | null = null
  let dataChannel: RTCDataChannel | null = null
  let pendingIceCandidates: RTCIceCandidateInit[] = []
  let statsIntervalId: ReturnType<typeof setInterval> | null = null
  let previousInboundVideoBytes: { bytes: number, timestamp: number } | null = null
  let previousOutboundVideoBytes: { bytes: number, timestamp: number } | null = null

  const canSendMessage = computed(() => dataChannelState.value === 'open')

  function numberValue(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) ? value : null
  }

  function stringValue(value: unknown): string {
    return typeof value === 'string' && value ? value : 'unknown'
  }

  function formatCandidate(candidate: StatsRecord | undefined): string {
    if (!candidate) {
      return 'unknown'
    }

    const type = stringValue(candidate.candidateType)
    const address = stringValue(candidate.address ?? candidate.ip)
    const port = numberValue(candidate.port)
    const protocol = stringValue(candidate.protocol)

    return `${type} ${protocol} ${address}${port === null ? '' : `:${port}`}`
  }

  function calculateBitrateKbps(
    currentBytes: number,
    currentTimestamp: number,
    previous: { bytes: number, timestamp: number } | null,
  ): number | null {
    if (!previous || currentTimestamp <= previous.timestamp) {
      return null
    }

    const bits = (currentBytes - previous.bytes) * 8
    const seconds = (currentTimestamp - previous.timestamp) / 1000

    if (bits < 0 || seconds <= 0) {
      return null
    }

    return Math.round(bits / seconds / 1000)
  }

  function findSelectedCandidatePair(report: RTCStatsReport): StatsRecord | undefined {
    for (const entry of report.values()) {
      const record = entry as StatsRecord

      if (record.type === 'transport' && typeof record.selectedCandidatePairId === 'string') {
        return report.get(record.selectedCandidatePairId) as StatsRecord | undefined
      }
    }

    return [...report.values()]
      .map(entry => entry as StatsRecord)
      .find(record => record.type === 'candidate-pair' && (record.selected === true || record.nominated === true))
  }

  function findVideoCodec(report: RTCStatsReport, codecId: unknown): string {
    if (typeof codecId !== 'string') {
      return 'unknown'
    }

    const codec = report.get(codecId) as StatsRecord | undefined
    const mimeType = stringValue(codec?.mimeType)

    return mimeType === 'unknown' ? 'unknown' : mimeType.replace('video/', '')
  }

  async function updateStats(): Promise<void> {
    if (!peerConnection || peerConnection.connectionState === 'closed') {
      return
    }

    const report = await peerConnection.getStats()
    const selectedPair = findSelectedCandidatePair(report)
    const localCandidate = typeof selectedPair?.localCandidateId === 'string'
      ? report.get(selectedPair.localCandidateId) as StatsRecord | undefined
      : undefined
    const remoteCandidate = typeof selectedPair?.remoteCandidateId === 'string'
      ? report.get(selectedPair.remoteCandidateId) as StatsRecord | undefined
      : undefined

    let inboundVideoBytes = 0
    let inboundVideoTimestamp = 0
    let outboundVideoBytes = 0
    let outboundVideoTimestamp = 0
    let packetsLost = 0
    let packetsReceived = 0
    let framesPerSecond: number | null = null
    let videoCodec = 'unknown'

    for (const entry of report.values()) {
      const record = entry as StatsRecord
      const mediaKind = record.kind ?? record.mediaType

      if (record.type === 'inbound-rtp' && mediaKind === 'video') {
        inboundVideoBytes += numberValue(record.bytesReceived) ?? 0
        inboundVideoTimestamp = Math.max(inboundVideoTimestamp, record.timestamp)
        packetsLost += numberValue(record.packetsLost) ?? 0
        packetsReceived += numberValue(record.packetsReceived) ?? 0
        framesPerSecond = numberValue(record.framesPerSecond) ?? framesPerSecond
        videoCodec = findVideoCodec(report, record.codecId)
      }

      if (record.type === 'outbound-rtp' && mediaKind === 'video') {
        outboundVideoBytes += numberValue(record.bytesSent) ?? 0
        outboundVideoTimestamp = Math.max(outboundVideoTimestamp, record.timestamp)

        if (videoCodec === 'unknown') {
          videoCodec = findVideoCodec(report, record.codecId)
        }
      }
    }

    const inboundVideoBitrateKbps = calculateBitrateKbps(
      inboundVideoBytes,
      inboundVideoTimestamp,
      previousInboundVideoBytes,
    )
    const outboundVideoBitrateKbps = calculateBitrateKbps(
      outboundVideoBytes,
      outboundVideoTimestamp,
      previousOutboundVideoBytes,
    )

    if (inboundVideoTimestamp > 0) {
      previousInboundVideoBytes = { bytes: inboundVideoBytes, timestamp: inboundVideoTimestamp }
    }

    if (outboundVideoTimestamp > 0) {
      previousOutboundVideoBytes = { bytes: outboundVideoBytes, timestamp: outboundVideoTimestamp }
    }

    const totalPackets = packetsLost + packetsReceived
    const packetLossPercent = totalPackets > 0
      ? Number(((packetsLost / totalPackets) * 100).toFixed(2))
      : null

    stats.value = {
      selectedCandidatePair: selectedPair ? stringValue(selectedPair.id) : 'unknown',
      localCandidate: formatCandidate(localCandidate),
      remoteCandidate: formatCandidate(remoteCandidate),
      roundTripTimeMs: numberValue(selectedPair?.currentRoundTripTime) === null
        ? null
        : Math.round(numberValue(selectedPair?.currentRoundTripTime)! * 1000),
      availableOutgoingBitrateKbps: numberValue(selectedPair?.availableOutgoingBitrate) === null
        ? null
        : Math.round(numberValue(selectedPair?.availableOutgoingBitrate)! / 1000),
      outboundVideoBitrateKbps,
      inboundVideoBitrateKbps,
      packetsLost: totalPackets > 0 ? packetsLost : null,
      packetLossPercent,
      framesPerSecond,
      videoCodec,
    }
  }

  function startStatsPolling(): void {
    if (statsIntervalId) {
      return
    }

    void updateStats().catch(() => {})
    statsIntervalId = setInterval(() => {
      void updateStats().catch(() => {})
    }, 1000)
  }

  function stopStatsPolling(): void {
    if (statsIntervalId) {
      clearInterval(statsIntervalId)
      statsIntervalId = null
    }

    previousInboundVideoBytes = null
    previousOutboundVideoBytes = null
  }

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
    startStatsPolling()

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
    iceConnectionState.value = 'closed'
    iceGatheringState.value = 'complete'
    remoteStream.value = null
    pendingIceCandidates = []
    stopStatsPolling()
    stats.value = { ...emptyStats }
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
    iceConnectionState.value = 'new'
    iceGatheringState.value = 'new'
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
    iceConnectionState,
    iceGatheringState,
    messages,
    error,
    stats,
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
