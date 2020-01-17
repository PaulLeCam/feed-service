import { FeedParams } from '@erebos/bzz-feed'
import { resJSON, resOrError } from '@erebos/bzz-node'
import { Hex, hexInput } from '@erebos/hex'
import { pubKeyToAddress } from '@erebos/keccak256'
import { KeyPair, createKeyPair, sign } from '@erebos/secp256k1'
import fetch, { Response } from 'node-fetch'

const URL = 'http://localhost:3000'

export default class ServiceClient {
  public address: string
  public keyPair: KeyPair

  constructor() {
    this.keyPair = createKeyPair()
    this.address = pubKeyToAddress(this.keyPair.getPublic('array'))
  }

  protected encodeBody(data: hexInput): string {
    const payload = Hex.from(data)
    const signature = sign(payload.toBytesArray(), this.keyPair)
    return JSON.stringify({
      key: this.keyPair.getPublic('hex'),
      payload: payload.value,
      signature: Hex.from(signature).value,
    })
  }

  protected getFeedURL(label: string): string {
    return `${URL}/${this.address}/feeds/${label}`
  }

  protected async fetchFeed(
    method: string,
    label: string,
    body: hexInput,
  ): Promise<Response> {
    return await fetch(this.getFeedURL(label), {
      method,
      body: this.encodeBody(body),
    })
  }

  public async setFeed(
    label: string,
    sources: Array<FeedParams>,
  ): Promise<FeedParams> {
    const res = await this.fetchFeed('PUT', label, { sources })
    return await resJSON<Response, FeedParams>(res)
  }

  public async deleteFeed(label: string): Promise<void> {
    const res = await this.fetchFeed('DELETE', label, label)
    await resOrError<Response>(res)
  }
}
