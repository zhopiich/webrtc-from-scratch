<script setup lang="ts">
import { computed, ref } from 'vue'
import ChatPanel from '@/components/ChatPanel.vue'
import ConnectionStatus from '@/components/ConnectionStatus.vue'
import MediaControls from '@/components/MediaControls.vue'
import RoomControls from '@/components/RoomControls.vue'
import VideoPanel from '@/components/VideoPanel.vue'
import { useWebRTC } from '@/composables/useWebRTC'

const roomDraft = ref('demo-room')

const {
  localStream,
  remoteStream,
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
  startLocalMedia,
  switchMediaDevice,
  toggleAudioMuted,
  toggleVideoOff,
  joinRoom,
  sendMessage,
  hangUp,
} = useWebRTC()

const hasLocalMedia = computed(() => localStream.value !== null)

async function join(): Promise<void> {
  await joinRoom(roomDraft.value)
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
      :is-joined="isJoined"
      @join="join"
      @hang-up="hangUp"
    />

    <MediaControls
      :audio-input-devices="audioInputDevices"
      :video-input-devices="videoInputDevices"
      :selected-audio-input-id="selectedAudioInputId"
      :selected-video-input-id="selectedVideoInputId"
      :has-local-media="hasLocalMedia"
      :is-audio-muted="isAudioMuted"
      :is-video-off="isVideoOff"
      @start-media="startLocalMedia"
      @select-audio-input="switchMediaDevice('audioinput', $event)"
      @select-video-input="switchMediaDevice('videoinput', $event)"
      @toggle-audio-muted="toggleAudioMuted"
      @toggle-video-off="toggleVideoOff"
    />

    <ConnectionStatus
      :signaling-state="signalingState"
      :connection-state="connectionState"
      :data-channel-state="dataChannelState"
      :error="error"
    />

    <VideoPanel
      :local-stream="localStream"
      :remote-stream="remoteStream"
    />

    <ChatPanel
      :messages="messages"
      :can-send="canSendMessage"
      @send="sendMessage"
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
