<script setup lang="ts">
import { ref } from 'vue'

interface ChatMessage {
  id: string
  from: 'local' | 'remote'
  text: string
}

defineProps<{
  messages: ChatMessage[]
  canSend: boolean
}>()

const emit = defineEmits<{
  send: [text: string]
}>()

const draft = ref('')

function sendDraft(): void {
  const text = draft.value.trim()

  if (!text) {
    return
  }

  emit('send', text)
  draft.value = ''
}
</script>

<template>
  <section class="chat-panel" aria-label="Text chat">
    <div class="messages">
      <p v-if="messages.length === 0" class="empty">
        No messages yet.
      </p>
      <p v-for="message in messages" :key="message.id" class="message" :class="message.from">
        <span>{{ message.from }}</span>
        {{ message.text }}
      </p>
    </div>

    <form class="chat-form" @submit.prevent="sendDraft">
      <input
        v-model="draft"
        :disabled="!canSend"
        placeholder="Send a message"
        autocomplete="off"
      >
      <button type="submit" :disabled="!canSend || !draft.trim()">
        Send
      </button>
    </form>
  </section>
</template>

<style scoped>
.chat-panel {
  display: grid;
  grid-template-rows: minmax(0, 1fr) auto;
  gap: 12px;
  border: 1px solid #d7dde5;
  border-radius: 8px;
  padding: 16px;
  background: #ffffff;
}

.messages {
  display: grid;
  align-content: start;
  min-height: 180px;
  max-height: none;
  overflow-y: auto;
  gap: 8px;
}

.empty {
  margin: 0;
  color: #64748b;
}

.message {
  width: fit-content;
  max-width: min(72ch, 100%);
  margin: 0;
  border-radius: 8px;
  padding: 8px 10px;
  background: #eef2f7;
  color: #0f172a;
  overflow-wrap: anywhere;
}

.message.local {
  justify-self: end;
  background: #dcfce7;
}

span {
  margin-right: 8px;
  color: #526173;
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
}

.chat-form {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 12px;
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

input:disabled,
button:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

@media (max-width: 520px) {
  .chat-form {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 820px) {
  .messages {
    max-height: 280px;
  }
}
</style>
