import type { WebRTCStats } from './types'
import { ref } from 'vue'

type StatsRecord = RTCStats & Record<string, unknown>

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

interface UseWebRTCStatsOptions {
  getPeerConnection: () => RTCPeerConnection | null
}

export function useWebRTCStats({ getPeerConnection }: UseWebRTCStatsOptions) {
  const stats = ref<WebRTCStats>({ ...emptyStats })

  let statsIntervalId: ReturnType<typeof setInterval> | null = null
  let previousInboundVideoBytes: { bytes: number, timestamp: number } | null = null
  let previousOutboundVideoBytes: { bytes: number, timestamp: number } | null = null

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
    const peerConnection = getPeerConnection()

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
    const roundTripTimeSeconds = numberValue(selectedPair?.currentRoundTripTime)
    const availableOutgoingBitrate = numberValue(selectedPair?.availableOutgoingBitrate)

    stats.value = {
      selectedCandidatePair: selectedPair ? stringValue(selectedPair.id) : 'unknown',
      localCandidate: formatCandidate(localCandidate),
      remoteCandidate: formatCandidate(remoteCandidate),
      roundTripTimeMs: roundTripTimeSeconds === null ? null : Math.round(roundTripTimeSeconds * 1000),
      availableOutgoingBitrateKbps: availableOutgoingBitrate === null
        ? null
        : Math.round(availableOutgoingBitrate / 1000),
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

  function resetStats(): void {
    stopStatsPolling()
    stats.value = { ...emptyStats }
  }

  return {
    stats,
    startStatsPolling,
    stopStatsPolling,
    resetStats,
  }
}
