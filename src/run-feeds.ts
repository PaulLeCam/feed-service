import { BzzFeed, PollFeedContentOptions } from '@erebos/bzz-feed'
import { BzzNode, resText } from '@erebos/bzz-node'
import { sign } from '@erebos/secp256k1'
import micro from 'micro'
import { flatMap } from 'rxjs/operators'
import { Response } from 'node-fetch'

import { BZZ_URL, SERVER_PORT } from './constants'
import { hashFeeds } from './auth'
import Client from './client'
import server from './server'

const POLL_OPTIONS: PollFeedContentOptions = {
  changedOnly: true,
  interval: 2000,
  mode: 'raw',
}

micro(server).listen(SERVER_PORT)

const bzzFeed = new BzzFeed({
  bzz: new BzzNode({ url: BZZ_URL }),
  signBytes: (bytes, key) => Promise.resolve(sign(bytes, key)),
})

const parseText = flatMap(async (res: Response | null) => {
  return res ? await resText(res) : null
})

async function setContent(client: Client, text: string): Promise<string> {
  return await bzzFeed.setContent(
    { user: client.address },
    text,
    undefined,
    client.keyPair,
  )
}

async function run() {
  const alice = new Client()
  const bob = new Client()

  console.log('User feeds:', { alice: alice.address, bob: bob.address })

  const sources = [{ user: alice.address }, { user: bob.address }]
  const [sharedServerFeed, singleServerFeed] = await Promise.all([
    alice.setFeed('alice-bob', sources),
    bob.setFeed('hello', [{ user: bob.address }]),
    setContent(alice, 'Hello from Alice'),
    setContent(bob, 'Hello from Bob'),
  ])

  if (sharedServerFeed.topic !== hashFeeds(sources)) {
    throw new Error('Invalid server feed topic')
  }

  bzzFeed
    .pollContent(sharedServerFeed, POLL_OPTIONS)
    .pipe(parseText)
    .subscribe({
      next: text => {
        console.log('Shared (Alice and Bob) server feed text:', text)

        if (text === 'Hello from Alice') {
          setContent(bob, 'Bob also says hello')
        } else if (text === 'Hello from Bob') {
          setContent(alice, 'Alice also says hello')
        }
      },
    })

  bzzFeed
    .pollContent(singleServerFeed, POLL_OPTIONS)
    .pipe(parseText)
    .subscribe({
      next: text => {
        console.log('Single (Bob) server feed text:', text)
      },
    })
}

run().catch(console.error)
