<script setup lang="ts">
import { useTemplateRef, watch } from 'vue'

const props = defineProps<{
  localStream: MediaStream | null
  remoteStream: MediaStream | null
}>()

const localVideo = useTemplateRef<HTMLVideoElement>('localVideo')
const remoteVideo = useTemplateRef<HTMLVideoElement>('remoteVideo')

watch(() => props.localStream, (stream) => {
  if (localVideo.value) {
    localVideo.value.srcObject = stream
  }
}, { immediate: true })

watch(() => props.remoteStream, (stream) => {
  if (remoteVideo.value) {
    remoteVideo.value.srcObject = stream
  }
}, { immediate: true })
</script>

<template>
  <section class="video-grid" aria-label="Video chat">
    <article>
      <header>Local</header>
      <video ref="localVideo" autoplay playsinline muted />
    </article>
    <article>
      <header>Remote</header>
      <video ref="remoteVideo" autoplay playsinline />
    </article>
  </section>
</template>

<style scoped>
.video-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

article {
  overflow: hidden;
  border: 1px solid #d7dde5;
  border-radius: 8px;
  background: #ffffff;
}

header {
  padding: 10px 12px;
  border-bottom: 1px solid #d7dde5;
  color: #526173;
  font-size: 0.875rem;
  font-weight: 700;
}

video {
  display: block;
  width: 100%;
  aspect-ratio: 16 / 9;
  background: #111827;
}

@media (max-width: 760px) {
  .video-grid {
    grid-template-columns: 1fr;
  }
}
</style>
