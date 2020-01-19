import { Hex, hexInput, hexValue } from '@erebos/hex'
import { hash, pubKeyToAddress } from '@erebos/keccak256'
import { KeyPair, createPublic, sign, verify } from '@erebos/secp256k1'

const FEED_ZERO_TOPIC = Buffer.alloc(32)

export interface AuthRequest {
  key: string
  payload: hexValue
  signature: hexValue
}

export interface FeedInput {
  user: string | hexValue
  topic?: string | hexInput
}

export function checkAddress(address: string, key: KeyPair | string): boolean {
  const pubKey = typeof key === 'string' ? createPublic(key) : key
  return address === pubKeyToAddress(pubKey.getPublic('array'))
}

export function checkSignature(req: AuthRequest): boolean {
  return verify(
    Hex.from(req.payload).toBytesArray(),
    Hex.from(req.signature).toBytesArray(),
    req.key,
  )
}

export function checkPayload<T = any>(req: AuthRequest): T | null {
  const data = Hex.from(req.payload)
  const sig = Hex.from(req.signature).toBytesArray()
  return verify(data.toBytesArray(), sig, req.key) ? data.toObject<T>() : null
}

export function signPayload(key: KeyPair, data: hexInput): AuthRequest {
  const payload = Hex.from(data)
  const signature = sign(payload.toBytesArray(), key)
  return {
    key: key.getPublic('hex'),
    payload: payload.value,
    signature: Hex.from(signature).value,
  }
}

export function hashFeeds(feeds: Array<FeedInput>): hexValue {
  const buffers = feeds.map(feed => {
    return Buffer.concat([
      Hex.from(feed.user).toBuffer(),
      feed.topic ? Hex.from(feed.topic).toBuffer() : FEED_ZERO_TOPIC,
    ])
  })
  const hashed = hash(Buffer.concat(buffers))
  return Hex.from(hashed).value
}
