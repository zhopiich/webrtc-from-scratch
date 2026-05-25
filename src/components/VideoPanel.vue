<script setup lang="ts">
import { useTemplateRef, watch } from 'vue'

const props = defineProps<{
  localStream: MediaStream | null
  remoteStream: MediaStream | null
}>()

const localVideo = useTemplateRef<HTMLVideoElement>('localVideo')
const remoteVideo = useTemplateRef<HTMLVideoElement>('remoteVideo')

function attachStream(video: HTMLVideoElement | null, stream: MediaStream | null): void {
  if (!video || video.srcObject === stream) {
    return
  }

  video.srcObject = stream

  if (stream) {
    void video.play().catch(() => {
      // The user can still start playback through the browser UI if autoplay is blocked.
    })
  }
}

watch([() => props.localStream, localVideo], ([stream, video]) => {
  attachStream(video, stream)
}, { immediate: true })

watch([() => props.remoteStream, remoteVideo], ([stream, video]) => {
  attachStream(video, stream)
}, { immediate: true })
</script>

<template>
  <section class="video-stage" aria-label="Video chat">
    <video ref="remoteVideo" class="remote-video" autoplay playsinline />
    <span class="remote-label">Remote</span>

    <div class="local-preview">
      <video ref="localVideo" autoplay playsinline muted />
      <span>Local</span>
    </div>
  </section>
</template>

<style scoped>
.video-stage {
  position: relative;
  overflow: hidden;
  border: 1px solid #d7dde5;
  border-radius: 8px;
  background: #111827;
}

.remote-video {
  display: block;
  width: 100%;
  aspect-ratio: 16 / 9;
  background: #111827;
  object-fit: cover;
}

.remote-label,
.local-preview span {
  position: absolute;
  border-radius: 4px;
  padding: 4px 8px;
  background: rgb(15 23 42 / 76%);
  color: #ffffff;
  font-size: 0.75rem;
  font-weight: 700;
}

.remote-label {
  right: 12px;
  bottom: 12px;
}

.local-preview {
  position: absolute;
  top: 12px;
  left: 12px;
  overflow: hidden;
  width: clamp(112px, 26%, 208px);
  border: 1px solid rgb(255 255 255 / 32%);
  border-radius: 6px;
  background: #1e293b;
  box-shadow: 0 2px 8px rgb(0 0 0 / 25%);
}

.local-preview video {
  display: block;
  width: 100%;
  aspect-ratio: 16 / 9;
  object-fit: cover;
}

.local-preview span {
  top: 6px;
  left: 6px;
  padding: 3px 6px;
}
</style>
