<script setup lang="ts">
import { computed, ref } from 'vue'
import ChatPanel from '@/components/ChatPanel.vue'
import ConnectionStatus from '@/components/ConnectionStatus.vue'
import MediaControls from '@/components/MediaControls.vue'
import RoomControls from '@/components/RoomControls.vue'
import StatsPanel from '@/components/StatsPanel.vue'
import VideoPanel from '@/components/VideoPanel.vue'
import { useWebRTC } from '@/composables/useWebRTC'

const roomDraft = ref('demo-room')

const {
  media,
  signaling,
  peer,
  chat,
  stats,
  configurationNotices,
  error,
  hangUp,
} = useWebRTC()

const hasLocalMedia = computed(() => media.localStream.value !== null)

async function join(): Promise<void> {
  await signaling.joinRoom(roomDraft.value)
}
</script>

<template>
  <main class="page-shell">
    <header class="page-header">
      <div>
        <p>WebRTC from scratch</p>
        <h1>1-on-1 Video Chat</h1>
      </div>
    </header>

    <RoomControls
      v-model="roomDraft"
      :is-joined="signaling.isJoined.value"
      @join="join"
      @hang-up="hangUp"
    />

    <MediaControls
      :audio-input-devices="media.audioInputDevices.value"
      :video-input-devices="media.videoInputDevices.value"
      :selected-audio-input-id="media.selectedAudioInputId.value"
      :selected-video-input-id="media.selectedVideoInputId.value"
      :has-local-media="hasLocalMedia"
      :is-audio-muted="media.isAudioMuted.value"
      :is-video-off="media.isVideoOff.value"
      @start-media="media.startLocalMedia"
      @select-audio-input="media.switchMediaDevice('audioinput', $event)"
      @select-video-input="media.switchMediaDevice('videoinput', $event)"
      @toggle-audio-muted="media.toggleAudioMuted"
      @toggle-video-off="media.toggleVideoOff"
    />

    <ConnectionStatus
      :signaling-state="signaling.signalingState.value"
      :connection-state="peer.connectionState.value"
      :data-channel-state="chat.dataChannelState.value"
      :notices="configurationNotices"
      :error="error"
    />

    <StatsPanel
      :signaling-state="signaling.signalingState.value"
      :ice-connection-state="peer.iceConnectionState.value"
      :ice-gathering-state="peer.iceGatheringState.value"
      :stats="stats.current.value"
    />

    <VideoPanel
      :local-stream="media.localStream.value"
      :remote-stream="media.remoteStream.value"
    />

    <ChatPanel
      :messages="chat.messages.value"
      :can-send="chat.canSendMessage.value"
      @send="chat.sendMessage"
    />
  </main>
</template>

<style scoped>
.page-shell {
  display: grid;
  width: min(1120px, calc(100% - 32px));
  margin: 0 auto;
  padding: 32px 0;
  gap: 16px;
}

.page-header {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 16px;
}

.page-header p {
  margin: 0 0 6px;
  color: #526173;
  font-size: 0.875rem;
  font-weight: 700;
  text-transform: uppercase;
}

.page-header h1 {
  margin: 0;
  color: #0f172a;
  font-size: 3rem;
  line-height: 1;
}

@media (max-width: 680px) {
  .page-header h1 {
    font-size: 2rem;
  }
}
</style>
