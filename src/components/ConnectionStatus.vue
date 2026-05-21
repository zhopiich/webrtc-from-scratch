<script setup lang="ts">
defineProps<{
  signalingState: string
  connectionState: string
  dataChannelState: string
  notices: string[]
  error: string
}>()
</script>

<template>
  <section class="status-grid" aria-label="Connection status">
    <div>
      <span>Signaling</span>
      <strong>{{ signalingState }}</strong>
    </div>
    <div>
      <span>Peer</span>
      <strong>{{ connectionState }}</strong>
    </div>
    <div>
      <span>Chat</span>
      <strong>{{ dataChannelState }}</strong>
    </div>
    <p v-if="error" class="error">
      {{ error }}
    </p>
    <div v-if="notices.length" class="notices">
      <p v-for="notice in notices" :key="notice">
        {{ notice }}
      </p>
    </div>
  </section>
</template>

<style scoped>
.status-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

div,
.error,
.notices {
  min-height: 72px;
  border: 1px solid #d7dde5;
  border-radius: 8px;
  padding: 14px;
  background: #ffffff;
}

span {
  display: block;
  color: #526173;
  font-size: 0.8125rem;
  font-weight: 600;
  text-transform: uppercase;
}

strong {
  display: block;
  margin-top: 8px;
  color: #0f172a;
  font-size: 1rem;
}

.error {
  grid-column: 1 / -1;
  margin: 0;
  border-color: #f2b8b5;
  background: #fff5f5;
  color: #9f1239;
}

.notices {
  grid-column: 1 / -1;
  min-height: 0;
  border-color: #f0d28a;
  background: #fff9e8;
  color: #744210;
}

.notices p {
  margin: 0;
}

.notices p + p {
  margin-top: 8px;
}

@media (max-width: 680px) {
  .status-grid {
    grid-template-columns: 1fr;
  }
}
</style>
