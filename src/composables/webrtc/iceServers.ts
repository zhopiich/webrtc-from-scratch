const defaultStunUrl = 'stun:stun.l.google.com:19302'

type IceServerEnv = Partial<Record<
  'VITE_STUN_URL' | 'VITE_TURN_URL' | 'VITE_TURN_USERNAME' | 'VITE_TURN_CREDENTIAL',
  string
>>

function readEnvValue(value: string | undefined): string {
  return value?.trim() ?? ''
}

export function getIceServers(env: IceServerEnv = import.meta.env as IceServerEnv): RTCIceServer[] {
  const stunUrl = readEnvValue(env.VITE_STUN_URL) || defaultStunUrl
  const turnUrl = readEnvValue(env.VITE_TURN_URL)
  const turnUsername = readEnvValue(env.VITE_TURN_USERNAME)
  const turnCredential = readEnvValue(env.VITE_TURN_CREDENTIAL)

  const iceServers: RTCIceServer[] = [
    { urls: stunUrl },
  ]

  if (turnUrl && turnUsername && turnCredential) {
    iceServers.push({
      urls: turnUrl,
      username: turnUsername,
      credential: turnCredential,
    })
  }

  return iceServers
}
