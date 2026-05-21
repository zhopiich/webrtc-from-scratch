<script setup lang="ts">
import type { WebRTCStats } from '@/composables/useWebRTC'

defineProps<{
  iceConnectionState: string
  iceGatheringState: string
  signalingState: string
  stats: WebRTCStats
}>()

function formatNumber(value: number | null, suffix = ''): string {
  return value === null ? 'unknown' : `${value}${suffix}`
}
</script>

<template>
  <section class="stats-panel" aria-label="WebRTC stats">
    <header>
      <h2>Connection details</h2>
    </header>

    <dl>
      <div>
        <dt>Signaling state</dt>
        <dd>{{ signalingState }}</dd>
      </div>
      <div>
        <dt>ICE connection</dt>
        <dd>{{ iceConnectionState }}</dd>
      </div>
      <div>
        <dt>ICE gathering</dt>
        <dd>{{ iceGatheringState }}</dd>
      </div>
      <div>
        <dt>Selected pair</dt>
        <dd>{{ stats.selectedCandidatePair }}</dd>
      </div>
      <div>
        <dt>Local candidate</dt>
        <dd>{{ stats.localCandidate }}</dd>
      </div>
      <div>
        <dt>Remote candidate</dt>
        <dd>{{ stats.remoteCandidate }}</dd>
      </div>
      <div>
        <dt>Codec</dt>
        <dd>{{ stats.videoCodec }}</dd>
      </div>
      <div>
        <dt>RTT</dt>
        <dd>{{ formatNumber(stats.roundTripTimeMs, ' ms') }}</dd>
      </div>
      <div>
        <dt>Available outbound</dt>
        <dd>{{ formatNumber(stats.availableOutgoingBitrateKbps, ' kbps') }}</dd>
      </div>
      <div>
        <dt>Outbound video</dt>
        <dd>{{ formatNumber(stats.outboundVideoBitrateKbps, ' kbps') }}</dd>
      </div>
      <div>
        <dt>Inbound video</dt>
        <dd>{{ formatNumber(stats.inboundVideoBitrateKbps, ' kbps') }}</dd>
      </div>
      <div>
        <dt>Packet loss</dt>
        <dd>
          {{ formatNumber(stats.packetLossPercent, '%') }}
          <span v-if="stats.packetsLost !== null">({{ stats.packetsLost }} lost)</span>
        </dd>
      </div>
      <div>
        <dt>FPS</dt>
        <dd>{{ formatNumber(stats.framesPerSecond) }}</dd>
      </div>
    </dl>
  </section>
</template>

<style scoped>
.stats-panel {
  display: grid;
  gap: 12px;
  border: 1px solid #d7dde5;
  border-radius: 8px;
  padding: 16px;
  background: #ffffff;
}

header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

h2 {
  margin: 0;
  color: #0f172a;
  font-size: 1rem;
}

dl {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  margin: 0;
}

div {
  min-width: 0;
  border: 1px solid #edf0f4;
  border-radius: 6px;
  padding: 10px;
  background: #f8fafc;
}

dt {
  color: #526173;
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
}

dd {
  overflow-wrap: anywhere;
  margin: 6px 0 0;
  color: #0f172a;
  font-size: 0.875rem;
}

span {
  color: #526173;
}

@media (max-width: 860px) {
  dl {
    grid-template-columns: 1fr;
  }
}
</style>
