import { BzzFeed, FeedParams, PollFeedContentOptions } from '@erebos/bzz-feed'
import { BzzNode } from '@erebos/bzz-node'
import { DocSynchronizer } from '@erebos/doc-sync'
import { pubKeyToAddress } from '@erebos/keccak256'
import { createKeyPair, sign } from '@erebos/secp256k1'
import Automerge from 'automerge'
import { json, send } from 'micro'
import { del, get, put, router } from 'microrouter'
import { Subscription, merge } from 'rxjs'
import { flatMap, throttleTime } from 'rxjs/operators'

import {
  AuthRequest,
  checkAddress,
  checkSignature,
  checkPayload,
  hashFeeds,
} from './auth'
import { BZZ_URL } from './constants'

const PULL_INTERVAL = 10000

const POLL_OPTIONS: PollFeedContentOptions = {
  changedOnly: true,
  immediate: true,
  interval: PULL_INTERVAL,
  mode: 'raw',
  whenEmpty: 'ignore',
}

const PUSH_THROTTLE = 10000

const bzz = new BzzNode({ url: BZZ_URL, timeout: 5000 })
const bzzFeed = new BzzFeed({
  bzz,
  signBytes: (bytes, key) => Promise.resolve(sign(bytes, key)),
})

interface FeedState {
  params: FeedParams
  subscription: Subscription
}

interface AddressState {
  docs: Record<string, DocSynchronizer<any>>
  feeds: Record<string, FeedState>
}

const globalState: Record<string, AddressState> = {}

function getState(address: string): AddressState {
  return globalState[address] ?? { docs: {}, feeds: {} }
}

async function createDoc(
  address: string,
  label: string,
  sources: Array<FeedParams>,
): Promise<FeedParams> {
  const state = getState(address)
  const kp = createKeyPair()

  const synchronizer = await DocSynchronizer.init({
    bzz: new BzzFeed({
      bzz,
      signBytes: bytes => Promise.resolve(sign(bytes, kp)),
    }),
    doc: Automerge.init(),
    feed: {
      user: pubKeyToAddress(kp.getPublic('array')),
      topic: hashFeeds(sources),
    },
    pullInterval: PULL_INTERVAL,
    sources,
  })

  const existing = state.docs[label]
  if (existing != null) {
    existing.stop()
  }

  state.docs[label] = synchronizer
  globalState[address] = state

  return synchronizer.metaFeed
}

function deleteDoc(address: string, label: string): boolean {
  const state = getState(address)
  const synchronizer = state.docs[label]
  if (synchronizer == null) {
    return false
  }
  synchronizer.stop()
  delete state.docs[label]
  return true
}

function createFeed(
  address: string,
  label: string,
  sources: Array<FeedParams>,
): FeedParams {
  const state = getState(address)
  const kp = createKeyPair()
  const feed = {
    user: pubKeyToAddress(kp.getPublic('array')),
    topic: hashFeeds(sources),
  }

  const feeds = sources.map(source =>
    bzzFeed.pollContentHash(source, POLL_OPTIONS),
  )
  const subscription = merge(...feeds)
    .pipe(
      throttleTime(PUSH_THROTTLE),
      flatMap(async hash => {
        await bzzFeed.setContentHash(feed, hash as string, undefined, kp)
        return hash
      }),
    )
    .subscribe({
      next: hash => {
        console.log('Server pushed feed', feed, hash)
      },
      error: err => {
        console.warn('Server feed subscription error', feed, err)
      },
    })

  const existing = state.feeds[label]
  if (existing != null) {
    existing.subscription.unsubscribe()
  }

  state.feeds[label] = { params: feed, subscription }
  globalState[address] = state

  return feed
}

function deleteFeed(address: string, label: string): boolean {
  const state = getState(address)
  const feed = state.feeds[label]
  if (feed == null) {
    return false
  }
  feed.subscription.unsubscribe()
  delete state.feeds[label]
  return true
}

export default router(
  get('/:address/docs', (req, res) => {
    const state = getState(req.params.address)
    if (state == null) {
      return send(res, 404)
    }

    const docs = Object.entries(state.docs).reduce(
      (acc, [label, synchronizer]) => {
        acc[label] = synchronizer.metaFeed
        return acc
      },
      {} as Record<string, FeedParams>,
    )
    send(res, 200, docs)
  }),

  get('/:address/docs/:label', (req, res) => {
    const { address, label } = req.params

    const state = getState(address)
    const synchronizer = state.docs[label]
    if (synchronizer == null) {
      return send(res, 404)
    }

    send(res, 200, synchronizer.metaFeed)
  }),

  put('/:address/docs/:label', async (req, res) => {
    const { address, label } = req.params
    const body = (await json(req)) as AuthRequest

    if (!checkAddress(address, body.key)) {
      return send(res, 401)
    }

    const data = checkPayload(body)
    if (data === null) {
      return send(res, 403)
    }

    const params = await createDoc(address, label, data.sources)
    send(res, 200, params)
  }),

  del('/:address/docs/:label', async (req, res) => {
    const { address, label } = req.params
    const body = (await json(req)) as AuthRequest

    if (!checkAddress(address, body.key)) {
      return send(res, 401)
    }
    if (!checkSignature(body)) {
      return send(res, 403)
    }

    send(res, deleteDoc(address, label) ? 204 : 404)
  }),

  get('/:address/feeds', (req, res) => {
    const state = getState(req.params.address)
    if (state == null) {
      return send(res, 404)
    }

    const feeds = Object.entries(state.feeds).reduce((acc, [label, feed]) => {
      acc[label] = feed.params
      return acc
    }, {} as Record<string, FeedParams>)
    send(res, 200, feeds)
  }),

  get('/:address/feeds/:label', (req, res) => {
    const { address, label } = req.params

    const state = getState(address)
    const feed = state.feeds[label]
    if (feed == null) {
      return send(res, 404)
    }

    send(res, 200, feed.params)
  }),

  put('/:address/feeds/:label', async (req, res) => {
    const { address, label } = req.params
    const body = (await json(req)) as AuthRequest

    if (!checkAddress(address, body.key)) {
      return send(res, 401)
    }

    const data = checkPayload(body)
    if (data === null) {
      return send(res, 403)
    }

    send(res, 200, createFeed(address, label, data.sources))
  }),

  del('/:address/feeds/:label', async (req, res) => {
    const { address, label } = req.params
    const body = (await json(req)) as AuthRequest

    if (!checkAddress(address, body.key)) {
      return send(res, 401)
    }
    if (!checkSignature(body)) {
      return send(res, 403)
    }

    send(res, deleteFeed(address, label) ? 204 : 404)
  }),
)
