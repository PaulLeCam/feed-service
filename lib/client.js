"use strict";

exports.__esModule = true;
exports.default = void 0;

var _bzzNode = require("@erebos/bzz-node");

var _keccak = require("@erebos/keccak256");

var _secp256k = require("@erebos/secp256k1");

var _nodeFetch = _interopRequireDefault(require("node-fetch"));

var _auth = require("./auth");

var _constants = require("./constants");

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

class Client {
  constructor() {
    this.keyPair = (0, _secp256k.createKeyPair)();
    this.address = (0, _keccak.pubKeyToAddress)(this.keyPair.getPublic('array'));
  }

  getDocURL(label) {
    return `${_constants.SERVER_URL}/${this.address}/docs/${label}`;
  }

  getFeedURL(label) {
    return `${_constants.SERVER_URL}/${this.address}/feeds/${label}`;
  }

  async fetch(method, url, body) {
    return await (0, _nodeFetch.default)(url, {
      method,
      body: JSON.stringify((0, _auth.signPayload)(this.keyPair, body))
    });
  }

  async setDoc(label, sources) {
    const res = await this.fetch('PUT', this.getDocURL(label), {
      sources
    });
    return await (0, _bzzNode.resJSON)(res);
  }

  async deleteDoc(label) {
    const res = await this.fetch('DELETE', this.getDocURL(label), label);
    await (0, _bzzNode.resOrError)(res);
  }

  async setFeed(label, sources) {
    const res = await this.fetch('PUT', this.getFeedURL(label), {
      sources
    });
    return await (0, _bzzNode.resJSON)(res);
  }

  async deleteFeed(label) {
    const res = await this.fetch('DELETE', this.getFeedURL(label), label);
    await (0, _bzzNode.resOrError)(res);
  }

}

exports.default = Client;