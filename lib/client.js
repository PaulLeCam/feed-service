"use strict";

exports.__esModule = true;
exports.default = void 0;

var _bzzNode = require("@erebos/bzz-node");

var _hex = require("@erebos/hex");

var _keccak = require("@erebos/keccak256");

var _secp256k = require("@erebos/secp256k1");

var _nodeFetch = _interopRequireDefault(require("node-fetch"));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

const URL = 'http://localhost:3000';

class ServiceClient {
  constructor() {
    this.keyPair = (0, _secp256k.createKeyPair)();
    this.address = (0, _keccak.pubKeyToAddress)(this.keyPair.getPublic('array'));
  }

  encodeBody(data) {
    const payload = _hex.Hex.from(data);

    const signature = (0, _secp256k.sign)(payload.toBytesArray(), this.keyPair);
    return JSON.stringify({
      key: this.keyPair.getPublic('hex'),
      payload: payload.value,
      signature: _hex.Hex.from(signature).value
    });
  }

  getFeedURL(label) {
    return `${URL}/${this.address}/feeds/${label}`;
  }

  async fetchFeed(method, label, body) {
    return await (0, _nodeFetch.default)(this.getFeedURL(label), {
      method,
      body: this.encodeBody(body)
    });
  }

  async setFeed(label, sources) {
    const res = await this.fetchFeed('PUT', label, {
      sources
    });
    return await (0, _bzzNode.resJSON)(res);
  }

  async deleteFeed(label) {
    const res = await this.fetchFeed('DELETE', label, label);
    await (0, _bzzNode.resOrError)(res);
  }

}

exports.default = ServiceClient;