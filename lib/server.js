"use strict";

exports.__esModule = true;
exports.default = void 0;

var _bzzFeed = require("@erebos/bzz-feed");

var _bzzNode = require("@erebos/bzz-node");

var _hex = require("@erebos/hex");

var _keccak = require("@erebos/keccak256");

var _secp256k = require("@erebos/secp256k1");

var _micro = require("micro");

var _microrouter = require("microrouter");

var _rxjs = require("rxjs");

var _operators = require("rxjs/operators");

const POLL_OPTIONS = {
  changedOnly: true,
  immediate: true,
  interval: 10000,
  mode: 'raw',
  whenEmpty: 'ignore'
};
const PUSH_THROTTLE = 10000;
const bzzFeed = new _bzzFeed.BzzFeed({
  bzz: new _bzzNode.BzzNode({
    url: 'http://localhost:8500',
    timeout: 5000
  }),
  signBytes: (bytes, key) => Promise.resolve((0, _secp256k.sign)(bytes, key))
});
const globalState = {};

function checkAddress(address, key) {
  return address === (0, _keccak.pubKeyToAddress)(key.getPublic('array'));
}

function checkSignature(payload, signature, pubKey) {
  return (0, _secp256k.verify)(_hex.Hex.from(payload).toBytesArray(), _hex.Hex.from(signature).toBytesArray(), pubKey);
}

function parsePayload(payload, signature, pubKey) {
  const data = _hex.Hex.from(payload);

  const sig = _hex.Hex.from(signature).toBytesArray();

  return (0, _secp256k.verify)(data.toBytesArray(), sig, pubKey) ? data.toObject() : null;
}

function createFeed(address, label, sources) {
  var _globalState$address;

  const state = (_globalState$address = globalState[address]) != null ? _globalState$address : {
    feeds: {}
  };
  const kp = (0, _secp256k.createKeyPair)();
  const user = (0, _keccak.pubKeyToAddress)(kp.getPublic('array'));
  const params = {
    user
  };
  const feeds = sources.map(source => bzzFeed.pollContentHash(source, POLL_OPTIONS));
  const subscription = (0, _rxjs.merge)(...feeds).pipe((0, _operators.throttleTime)(PUSH_THROTTLE), (0, _operators.flatMap)(async hash => {
    await bzzFeed.setContentHash(params, hash, undefined, kp);
    return hash;
  })).subscribe({
    next: hash => {
      console.log('Server pushed feed', params, hash);
    },
    error: err => {
      console.warn('Server feed subscription error', params, err);
    }
  });
  const existing = state.feeds[label];

  if (existing != null) {
    existing.subscription.unsubscribe();
  }

  state.feeds[label] = {
    params,
    subscription
  };
  globalState[address] = state;
  return params;
}

function deleteFeed(address, label) {
  var _globalState$address2;

  const state = (_globalState$address2 = globalState[address]) != null ? _globalState$address2 : {
    feeds: {}
  };
  const feed = state.feeds[label];

  if (feed != null) {
    feed.subscription.unsubscribe();
    delete state.feeds[label];
  }
}

var _default = (0, _microrouter.router)((0, _microrouter.get)('/:address/feeds', (req, res) => {
  const state = globalState[req.params.address];

  if (state == null) {
    return (0, _micro.send)(res, 404);
  }

  const feeds = Object.entries(state.feeds).reduce((acc, [label, feed]) => {
    acc[label] = feed.params;
    return acc;
  }, {});
  (0, _micro.send)(res, 200, feeds);
}), (0, _microrouter.get)('/:address/feeds/:label', (req, res) => {
  const {
    address,
    label
  } = req.params;
  const state = globalState[address];

  if (state == null) {
    return (0, _micro.send)(res, 404);
  }

  const feed = state.feeds[label];

  if (feed == null) {
    return (0, _micro.send)(res, 404);
  }

  (0, _micro.send)(res, 200, feed.params);
}), (0, _microrouter.put)('/:address/feeds/:label', async (req, res) => {
  const {
    address,
    label
  } = req.params;
  const body = await (0, _micro.json)(req);
  const pubKey = (0, _secp256k.createPublic)(body.key);

  if (!checkAddress(address, pubKey)) {
    return (0, _micro.send)(res, 401);
  }

  const data = parsePayload(body.payload, body.signature, pubKey);

  if (data === null) {
    return (0, _micro.send)(res, 403);
  }

  (0, _micro.send)(res, 200, createFeed(address, label, data.sources));
}), (0, _microrouter.del)('/:address/feeds/:label', async (req, res) => {
  const {
    address,
    label
  } = req.params;
  const body = await (0, _micro.json)(req);
  const pubKey = (0, _secp256k.createPublic)(body.key);

  if (!checkAddress(address, pubKey)) {
    return (0, _micro.send)(res, 401);
  }

  if (!checkSignature(label, body.signature, pubKey)) {
    return (0, _micro.send)(res, 403);
  }

  const state = globalState[address];

  if (state == null) {
    return (0, _micro.send)(res, 404);
  }

  deleteFeed(address, label);
  (0, _micro.send)(res, 204);
}));

exports.default = _default;