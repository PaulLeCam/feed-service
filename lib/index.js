"use strict";

exports.__esModule = true;
exports.default = void 0;

var _bzzFeed = require("@erebos/bzz-feed");

var _bzzNode = require("@erebos/bzz-node");

var _keccak = require("@erebos/keccak256");

var _secp256k = require("@erebos/secp256k1");

var _micro = require("micro");

var _microrouter = require("microrouter");

var _rxjs = require("rxjs");

var _operators = require("rxjs/operators");

const POLL_OPTIONS = {
  changedOnly: true,
  interval: 10000,
  whenEmpty: 'ignore'
};
const PUSH_THROTTLE = 10000;
const bzz = new _bzzNode.BzzNode({
  url: 'http://localhost:8500',
  timeout: 5000
});
const bzzFeed = new _bzzFeed.BzzFeed({
  bzz,
  signBytes: (bytes, key) => Promise.resolve((0, _secp256k.sign)(bytes, key))
});
const state = {
  feeds: {}
};

async function createFeed(key, sources) {
  const kp = (0, _secp256k.createKeyPair)();
  const user = (0, _keccak.pubKeyToAddress)(kp.getPublic('array'));
  const params = {
    user
  };
  const feeds = sources.map(source => bzzFeed.pollContent(source, POLL_OPTIONS));
  const subscription = (0, _rxjs.merge)(...feeds).pipe((0, _operators.throttleTime)(PUSH_THROTTLE), (0, _operators.flatMap)(async content => await bzzFeed.setContent(params, content))).subscribe();
  state.feeds[key] = {
    params,
    subscription
  };
  return params;
}

function deleteFeed(key) {
  const feed = state.feeds[key];

  if (feed != null) {
    feed.subscription.unsubscribe();
    delete state.feeds[key];
  }
}

var _default = (0, _microrouter.router)((0, _microrouter.del)('/feeds/:key', (req, res) => {
  deleteFeed(req.params.key);
  (0, _micro.send)(res, 204);
}), (0, _microrouter.get)('/feeds', (req, res) => {
  const feeds = Object.entries(state.feeds).reduce((acc, [key, feed]) => {
    acc[key] = feed.params;
    return acc;
  }, {});
  (0, _micro.send)(res, 200, feeds);
}), (0, _microrouter.post)('/feeds', async (req, res) => {
  const data = await (0, _micro.json)(req);
  const params = createFeed(data.key, data.sources);
  (0, _micro.send)(res, 200, params);
}));

exports.default = _default;