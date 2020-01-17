import { BzzFeed, FeedParams, PollFeedContentOptions } from '@erebos/bzz-feed'
import { BzzNode } from '@erebos/bzz-node'
import { Hex, hexInput } from '@erebos/hex'
import { pubKeyToAddress } from '@erebos/keccak256'
import {
  KeyPair,
  createKeyPair,
  createPublic,
  sign,
  verify,
} from '@erebos/secp256k1'
import { json, send } from 'micro'
import { del, get, put, router } from 'microrouter'
import { Subscription, merge } from 'rxjs'
import { flatMap, throttleTime } from 'rxjs/operators'

const POLL_OPTIONS: PollFeedContentOptions = {
  changedOnly: true,
  immediate: true,
  interval: 10000,
  mode: 'raw',
  whenEmpty: 'ignore',
}

const PUSH_THROTTLE = 10000

const bzzFeed = new BzzFeed({
  bzz: new BzzNode({ url: 'http://localhost:8500', timeout: 5000 }),
  signBytes: (bytes, key) => Promise.resolve(sign(bytes, key)),
})

interface FeedState {
  params: FeedParams
  subscription: Subscription
}

interface AddressState {
  feeds: Record<string, FeedState>
}

const globalState: Record<string, AddressState> = {}

function checkAddress(address: string, key: KeyPair): boolean {
  return address === pubKeyToAddress(key.getPublic('array'))
}

function checkSignature(
  payload: hexInput,
  signature: hexInput,
  pubKey: KeyPair,
): boolean {
  return verify(
    Hex.from(payload).toBytesArray(),
    Hex.from(signature).toBytesArray(),
    pubKey,
  )
}

function parsePayload<T = any>(
  payload: hexInput,
  signature: hexInput,
  pubKey: KeyPair,
): T | null {
  const data = Hex.from(payload)
  const sig = Hex.from(signature).toBytesArray()
  return verify(data.toBytesArray(), sig, pubKey) ? data.toObject<T>() : null
}

function createFeed(
  address: string,
  label: string,
  sources: Array<FeedParams>,
): FeedParams {
  const state = globalState[address] ?? { feeds: {} }

  const kp = createKeyPair()
  const user = pubKeyToAddress(kp.getPublic('array'))
  const params = { user }

  const feeds = sources.map(source =>
    bzzFeed.pollContentHash(source, POLL_OPTIONS),
  )
  const subscription = merge(...feeds)
    .pipe(
      throttleTime(PUSH_THROTTLE),
      flatMap(async hash => {
        await bzzFeed.setContentHash(params, hash, undefined, kp)
        return hash
      }),
    )
    .subscribe({
      next: hash => {
        console.log('Server pushed feed', params, hash)
      },
      error: err => {
        console.warn('Server feed subscription error', params, err)
      },
    })

  const existing = state.feeds[label]
  if (existing != null) {
    existing.subscription.unsubscribe()
  }

  state.feeds[label] = { params, subscription }
  globalState[address] = state

  return params
}

function deleteFeed(address: string, label: string): void {
  const state = globalState[address] ?? { feeds: {} }
  const feed = state.feeds[label]
  if (feed != null) {
    feed.subscription.unsubscribe()
    delete state.feeds[label]
  }
}

export default router(
  get('/:address/feeds', (req, res) => {
    const state = globalState[req.params.address]
    if (state == null) {
      return send(res, 404)
    }

    const feeds = Object.entries(state.feeds).reduce((acc, [label, feed]) => {
      acc[label] = feed.params
      return acc
    }, {})
    send(res, 200, feeds)
  }),

  get('/:address/feeds/:label', (req, res) => {
    const { address, label } = req.params

    const state = globalState[address]
    if (state == null) {
      return send(res, 404)
    }

    const feed = state.feeds[label]
    if (feed == null) {
      return send(res, 404)
    }

    send(res, 200, feed.params)
  }),

  put('/:address/feeds/:label', async (req, res) => {
    const { address, label } = req.params
    const body = await json(req)
    const pubKey = createPublic(body.key)

    if (!checkAddress(address, pubKey)) {
      return send(res, 401)
    }

    const data = parsePayload(body.payload, body.signature, pubKey)
    if (data === null) {
      return send(res, 403)
    }

    send(res, 200, createFeed(address, label, data.sources))
  }),

  del('/:address/feeds/:label', async (req, res) => {
    const { address, label } = req.params
    const body = await json(req)
    const pubKey = createPublic(body.key)

    if (!checkAddress(address, pubKey)) {
      return send(res, 401)
    }
    if (!checkSignature(label, body.signature, pubKey)) {
      return send(res, 403)
    }

    const state = globalState[address]
    if (state == null) {
      return send(res, 404)
    }

    deleteFeed(address, label)
    send(res, 204)
  }),
)
