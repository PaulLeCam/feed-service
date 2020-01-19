import { BzzFeed } from '@erebos/bzz-feed'
import { BzzNode } from '@erebos/bzz-node'
import { DocReader, DocWriter } from '@erebos/doc-sync'
import { sign } from '@erebos/secp256k1'
import micro from 'micro'

import { BZZ_URL, SERVER_PORT } from './constants'
import Client from './client'
import server from './server'

micro(server).listen(SERVER_PORT)

const bzz = new BzzNode({ url: BZZ_URL })
const bzzFeed = new BzzFeed({ bzz })

async function run() {
  const alice = new Client()
  const aliceWriter = DocWriter.create<any>({
    bzz: new BzzFeed({
      bzz,
      signBytes: bytes => Promise.resolve(sign(bytes, alice.keyPair)),
    }),
    feed: { user: alice.address },
  })

  const bob = new Client()
  const bobWriter = DocWriter.create<any>({
    bzz: new BzzFeed({
      bzz,
      signBytes: bytes => Promise.resolve(sign(bytes, bob.keyPair)),
    }),
    feed: { user: bob.address },
  })

  aliceWriter.change(doc => {
    doc.alice = 'Hello'
  })
  bobWriter.change(doc => {
    doc.bob = 'Hello'
  })
  await Promise.all([aliceWriter.push(), bobWriter.push()])

  const serverFeed = await alice.setDoc('alice-bob', [
    aliceWriter.metaFeed,
    bobWriter.metaFeed,
  ])
  const serverReader = await DocReader.load({
    bzz: bzzFeed,
    feed: serverFeed,
  })
  console.log('Server output doc:', serverReader.value)
}

run().catch(console.error)
