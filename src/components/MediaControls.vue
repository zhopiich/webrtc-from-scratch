<script setup lang="ts">
defineProps<{
  audioInputDevices: MediaDeviceInfo[]
  videoInputDevices: MediaDeviceInfo[]
  selectedAudioInputId: string
  selectedVideoInputId: string
  hasLocalMedia: boolean
  isAudioMuted: boolean
  isVideoOff: boolean
}>()

const emit = defineEmits<{
  startMedia: []
  selectAudioInput: [deviceId: string]
  selectVideoInput: [deviceId: string]
  toggleAudioMuted: []
  toggleVideoOff: []
}>()
</script>

<template>
  <section class="media-controls" aria-label="Media controls">
    <label class="field">
      <span>Camera</span>
      <select
        :value="selectedVideoInputId"
        :disabled="!hasLocalMedia"
        @change="emit('selectVideoInput', ($event.target as HTMLSelectElement).value)"
      >
        <option value="">
          Default camera
        </option>
        <option
          v-for="device in videoInputDevices"
          :key="device.deviceId"
          :value="device.deviceId"
        >
          {{ device.label || 'Camera' }}
        </option>
      </select>
    </label>

    <label class="field">
      <span>Microphone</span>
      <select
        :value="selectedAudioInputId"
        :disabled="!hasLocalMedia"
        @change="emit('selectAudioInput', ($event.target as HTMLSelectElement).value)"
      >
        <option value="">
          Default microphone
        </option>
        <option
          v-for="device in audioInputDevices"
          :key="device.deviceId"
          :value="device.deviceId"
        >
          {{ device.label || 'Microphone' }}
        </option>
      </select>
    </label>

    <button type="button" :disabled="hasLocalMedia" @click="emit('startMedia')">
      Start media
    </button>
    <button type="button" :disabled="!hasLocalMedia" @click="emit('toggleAudioMuted')">
      {{ isAudioMuted ? 'Unmute' : 'Mute' }}
    </button>
    <button type="button" :disabled="!hasLocalMedia" @click="emit('toggleVideoOff')">
      {{ isVideoOff ? 'Camera on' : 'Camera off' }}
    </button>
  </section>
</template>

<style scoped>
.media-controls {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto auto auto;
  gap: 12px;
  align-items: end;
  padding: 16px;
  border: 1px solid #d7dde5;
  border-radius: 8px;
  background: #ffffff;
}

.field {
  display: grid;
  min-width: 0;
  gap: 6px;
}

span {
  color: #526173;
  font-size: 0.875rem;
  font-weight: 600;
}

select,
button {
  min-height: 40px;
  border-radius: 6px;
  font: inherit;
}

select {
  width: 100%;
  min-width: 0;
  border: 1px solid #b8c2cf;
  padding: 0 12px;
  background: #ffffff;
}

button {
  border: 1px solid #b8c2cf;
  padding: 0 16px;
  background: #ffffff;
  color: #0f172a;
  cursor: pointer;
}

select:disabled,
button:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

@media (max-width: 860px) {
  .media-controls {
    grid-template-columns: 1fr;
  }
}
</style>
