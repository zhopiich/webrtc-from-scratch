import { describe, expect, it } from 'vitest'
import { getIceServers } from './iceServers'

describe('getIceServers', () => {
  it('uses the default STUN server when no env is configured', () => {
    expect(getIceServers({})).toEqual([
      { urls: 'stun:stun.l.google.com:19302' },
    ])
  })

  it('uses a custom STUN server when configured', () => {
    expect(getIceServers({
      VITE_STUN_URL: ' stun:stun.example.com:3478 ',
    })).toEqual([
      { urls: 'stun:stun.example.com:3478' },
    ])
  })

  it('adds TURN only when url, username, and credential are configured', () => {
    expect(getIceServers({
      VITE_TURN_URL: 'turn:turn.example.com:3478',
      VITE_TURN_USERNAME: 'user',
    })).toEqual([
      { urls: 'stun:stun.l.google.com:19302' },
    ])

    expect(getIceServers({
      VITE_TURN_URL: 'turn:turn.example.com:3478',
      VITE_TURN_USERNAME: 'user',
      VITE_TURN_CREDENTIAL: 'secret',
    })).toEqual([
      { urls: 'stun:stun.l.google.com:19302' },
      {
        urls: 'turn:turn.example.com:3478',
        username: 'user',
        credential: 'secret',
      },
    ])
  })
})
