"use strict";

exports.__esModule = true;
exports.default = void 0;

var _bzzFeed = require("@erebos/bzz-feed");

var _bzzNode = require("@erebos/bzz-node");

var _docSync = require("@erebos/doc-sync");

var _keccak = require("@erebos/keccak256");

var _secp256k = require("@erebos/secp256k1");

var _automerge = _interopRequireDefault(require("automerge"));

var _micro = require("micro");

var _microrouter = require("microrouter");

var _rxjs = require("rxjs");

var _operators = require("rxjs/operators");

var _auth = require("./auth");

var _constants = require("./constants");

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

const PULL_INTERVAL = 10000;
const POLL_OPTIONS = {
  changedOnly: true,
  immediate: true,
  interval: PULL_INTERVAL,
  mode: 'raw',
  whenEmpty: 'ignore'
};
const PUSH_THROTTLE = 10000;
const bzz = new _bzzNode.BzzNode({
  url: _constants.BZZ_URL,
  timeout: 5000
});
const bzzFeed = new _bzzFeed.BzzFeed({
  bzz,
  signBytes: (bytes, key) => Promise.resolve((0, _secp256k.sign)(bytes, key))
});
const globalState = {};

function getState(address) {
  var _globalState$address;

  return (_globalState$address = globalState[address]) != null ? _globalState$address : {
    docs: {},
    feeds: {}
  };
}

async function createDoc(address, label, sources) {
  const state = getState(address);
  const kp = (0, _secp256k.createKeyPair)();
  const synchronizer = await _docSync.DocSynchronizer.init({
    bzz: new _bzzFeed.BzzFeed({
      bzz,
      signBytes: bytes => Promise.resolve((0, _secp256k.sign)(bytes, kp))
    }),
    doc: _automerge.default.init(),
    feed: {
      user: (0, _keccak.pubKeyToAddress)(kp.getPublic('array')),
      topic: (0, _auth.hashFeeds)(sources)
    },
    pullInterval: PULL_INTERVAL,
    sources
  });
  const existing = state.docs[label];

  if (existing != null) {
    existing.stop();
  }

  state.docs[label] = synchronizer;
  globalState[address] = state;
  return synchronizer.metaFeed;
}

function deleteDoc(address, label) {
  const state = getState(address);
  const synchronizer = state.docs[label];

  if (synchronizer == null) {
    return false;
  }

  synchronizer.stop();
  delete state.docs[label];
  return true;
}

function createFeed(address, label, sources) {
  const state = getState(address);
  const kp = (0, _secp256k.createKeyPair)();
  const feed = {
    user: (0, _keccak.pubKeyToAddress)(kp.getPublic('array')),
    topic: (0, _auth.hashFeeds)(sources)
  };
  const feeds = sources.map(source => bzzFeed.pollContentHash(source, POLL_OPTIONS));
  const subscription = (0, _rxjs.merge)(...feeds).pipe((0, _operators.throttleTime)(PUSH_THROTTLE), (0, _operators.flatMap)(async hash => {
    await bzzFeed.setContentHash(feed, hash, undefined, kp);
    return hash;
  })).subscribe({
    next: hash => {
      console.log('Server pushed feed', feed, hash);
    },
    error: err => {
      console.warn('Server feed subscription error', feed, err);
    }
  });
  const existing = state.feeds[label];

  if (existing != null) {
    existing.subscription.unsubscribe();
  }

  state.feeds[label] = {
    params: feed,
    subscription
  };
  globalState[address] = state;
  return feed;
}

function deleteFeed(address, label) {
  const state = getState(address);
  const feed = state.feeds[label];

  if (feed == null) {
    return false;
  }

  feed.subscription.unsubscribe();
  delete state.feeds[label];
  return true;
}

var _default = (0, _microrouter.router)((0, _microrouter.get)('/:address/docs', (req, res) => {
  const state = getState(req.params.address);

  if (state == null) {
    return (0, _micro.send)(res, 404);
  }

  const docs = Object.entries(state.docs).reduce((acc, [label, synchronizer]) => {
    acc[label] = synchronizer.metaFeed;
    return acc;
  }, {});
  (0, _micro.send)(res, 200, docs);
}), (0, _microrouter.get)('/:address/docs/:label', (req, res) => {
  const {
    address,
    label
  } = req.params;
  const state = getState(address);
  const synchronizer = state.docs[label];

  if (synchronizer == null) {
    return (0, _micro.send)(res, 404);
  }

  (0, _micro.send)(res, 200, synchronizer.metaFeed);
}), (0, _microrouter.put)('/:address/docs/:label', async (req, res) => {
  const {
    address,
    label
  } = req.params;
  const body = await (0, _micro.json)(req);

  if (!(0, _auth.checkAddress)(address, body.key)) {
    return (0, _micro.send)(res, 401);
  }

  const data = (0, _auth.checkPayload)(body);

  if (data === null) {
    return (0, _micro.send)(res, 403);
  }

  const params = await createDoc(address, label, data.sources);
  (0, _micro.send)(res, 200, params);
}), (0, _microrouter.del)('/:address/docs/:label', async (req, res) => {
  const {
    address,
    label
  } = req.params;
  const body = await (0, _micro.json)(req);

  if (!(0, _auth.checkAddress)(address, body.key)) {
    return (0, _micro.send)(res, 401);
  }

  if (!(0, _auth.checkSignature)(body)) {
    return (0, _micro.send)(res, 403);
  }

  (0, _micro.send)(res, deleteDoc(address, label) ? 204 : 404);
}), (0, _microrouter.get)('/:address/feeds', (req, res) => {
  const state = getState(req.params.address);

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
  const state = getState(address);
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

  if (!(0, _auth.checkAddress)(address, body.key)) {
    return (0, _micro.send)(res, 401);
  }

  const data = (0, _auth.checkPayload)(body);

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

  if (!(0, _auth.checkAddress)(address, body.key)) {
    return (0, _micro.send)(res, 401);
  }

  if (!(0, _auth.checkSignature)(body)) {
    return (0, _micro.send)(res, 403);
  }

  (0, _micro.send)(res, deleteFeed(address, label) ? 204 : 404);
}));

exports.default = _default;