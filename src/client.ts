import { FeedParams } from '@erebos/bzz-feed'
import { resJSON, resOrError } from '@erebos/bzz-node'
import { hexInput } from '@erebos/hex'
import { pubKeyToAddress } from '@erebos/keccak256'
import { KeyPair, createKeyPair } from '@erebos/secp256k1'
import fetch, { Response } from 'node-fetch'

import { signPayload } from './auth'
import { SERVER_URL } from './constants'

export default class Client {
  public address: string
  public keyPair: KeyPair

  constructor() {
    this.keyPair = createKeyPair()
    this.address = pubKeyToAddress(this.keyPair.getPublic('array'))
  }

  protected getDocURL(label: string): string {
    return `${SERVER_URL}/${this.address}/docs/${label}`
  }

  protected getFeedURL(label: string): string {
    return `${SERVER_URL}/${this.address}/feeds/${label}`
  }

  protected async fetch(
    method: string,
    url: string,
    body: hexInput,
  ): Promise<Response> {
    return await fetch(url, {
      method,
      body: JSON.stringify(signPayload(this.keyPair, body)),
    })
  }

  public async setDoc(
    label: string,
    sources: Array<FeedParams>,
  ): Promise<FeedParams> {
    const res = await this.fetch('PUT', this.getDocURL(label), { sources })
    return await resJSON<Response, FeedParams>(res)
  }

  public async deleteDoc(label: string): Promise<void> {
    const res = await this.fetch('DELETE', this.getDocURL(label), label)
    await resOrError<Response>(res)
  }

  public async setFeed(
    label: string,
    sources: Array<FeedParams>,
  ): Promise<FeedParams> {
    const res = await this.fetch('PUT', this.getFeedURL(label), { sources })
    return await resJSON<Response, FeedParams>(res)
  }

  public async deleteFeed(label: string): Promise<void> {
    const res = await this.fetch('DELETE', this.getFeedURL(label), label)
    await resOrError<Response>(res)
  }
}
