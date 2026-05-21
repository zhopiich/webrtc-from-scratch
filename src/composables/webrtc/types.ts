export interface ChatMessage {
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

export type SignalingState = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'closed' | 'error'
export type DataChannelStatus = 'idle' | 'connecting' | 'open' | 'closed'

export type ServerMessage
  = | { type: 'room-joined', roomId: string }
    | { type: 'peer-joined' }
    | { type: 'offer', sdp: RTCSessionDescriptionInit }
    | { type: 'answer', sdp: RTCSessionDescriptionInit }
    | { type: 'ice-candidate', candidate: RTCIceCandidateInit }
    | { type: 'peer-left' }
    | { type: 'room-full' }
    | { type: 'error', message: string }

export type ClientMessage
  = | { type: 'join', roomId: string }
    | { type: 'offer', sdp: RTCSessionDescriptionInit }
    | { type: 'answer', sdp: RTCSessionDescriptionInit }
    | { type: 'ice-candidate', candidate: RTCIceCandidateInit }
