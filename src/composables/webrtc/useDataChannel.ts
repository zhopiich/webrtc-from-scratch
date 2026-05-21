import type { ChatMessage, DataChannelStatus } from './types'
import { computed, ref } from 'vue'

interface UseDataChannelOptions {
  onError: (message: string) => void
}

export function useDataChannel({ onError }: UseDataChannelOptions) {
  const dataChannelState = ref<DataChannelStatus>('idle')
  const messages = ref<ChatMessage[]>([])

  let dataChannel: RTCDataChannel | null = null

  const canSendMessage = computed(() => dataChannelState.value === 'open')

  function hasDataChannel(): boolean {
    return dataChannel !== null
  }

  function setupDataChannel(channel: RTCDataChannel): void {
    dataChannel = channel
    dataChannelState.value = channel.readyState === 'open' ? 'open' : 'connecting'

    channel.onopen = () => {
      dataChannelState.value = 'open'
    }

    channel.onclose = () => {
      dataChannelState.value = 'closed'
    }

    channel.onerror = () => {
      onError('DataChannel error.')
      dataChannelState.value = 'closed'
    }

    channel.onmessage = (event) => {
      messages.value.push({
        id: crypto.randomUUID(),
        from: 'remote',
        text: String(event.data),
      })
    }
  }

  function sendMessage(text: string): void {
    const trimmedText = text.trim()

    if (!trimmedText || !dataChannel || dataChannel.readyState !== 'open') {
      return
    }

    dataChannel.send(trimmedText)
    messages.value.push({
      id: crypto.randomUUID(),
      from: 'local',
      text: trimmedText,
    })
  }

  function closeDataChannel(): void {
    dataChannel?.close()
    dataChannel = null
    dataChannelState.value = 'closed'
  }

  function resetDataChannel(): void {
    messages.value = []
    dataChannelState.value = 'idle'
  }

  return {
    dataChannelState,
    messages,
    canSendMessage,
    hasDataChannel,
    setupDataChannel,
    sendMessage,
    closeDataChannel,
    resetDataChannel,
  }
}
