<script setup lang="ts">
defineProps<{
  modelValue: string
  isJoined: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
  'join': []
  'hangUp': []
}>()
</script>

<template>
  <form class="room-controls" @submit.prevent="emit('join')">
    <label class="field">
      <span>Room</span>
      <input
        :value="modelValue"
        :disabled="isJoined"
        placeholder="demo-room"
        autocomplete="off"
        @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
      >
    </label>

    <button type="submit" :disabled="isJoined || !modelValue.trim()">
      Join
    </button>
    <button type="button" :disabled="!isJoined" @click="emit('hangUp')">
      Hang up
    </button>
  </form>
</template>

<style scoped>
.room-controls {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  gap: 12px;
  align-items: end;
  padding: 16px;
  border: 1px solid #d7dde5;
  border-radius: 8px;
  background: #ffffff;
}

.field {
  display: grid;
  gap: 6px;
}

span {
  color: #526173;
  font-size: 0.875rem;
  font-weight: 600;
}

input,
button {
  min-height: 40px;
  border-radius: 6px;
  font: inherit;
}

input {
  width: 100%;
  border: 1px solid #b8c2cf;
  padding: 0 12px;
}

button {
  border: 1px solid #0f172a;
  padding: 0 16px;
  background: #0f172a;
  color: #ffffff;
  cursor: pointer;
}

button[type='button'] {
  border-color: #b8c2cf;
  background: #ffffff;
  color: #0f172a;
}

input:disabled,
button:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

@media (max-width: 680px) {
  .room-controls {
    grid-template-columns: 1fr;
  }
}
</style>
