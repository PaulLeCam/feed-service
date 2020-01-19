"use strict";

var _bzzFeed = require("@erebos/bzz-feed");

var _bzzNode = require("@erebos/bzz-node");

var _docSync = require("@erebos/doc-sync");

var _secp256k = require("@erebos/secp256k1");

var _micro = _interopRequireDefault(require("micro"));

var _constants = require("./constants");

var _client = _interopRequireDefault(require("./client"));

var _server = _interopRequireDefault(require("./server"));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

(0, _micro.default)(_server.default).listen(_constants.SERVER_PORT);
const bzz = new _bzzNode.BzzNode({
  url: _constants.BZZ_URL
});
const bzzFeed = new _bzzFeed.BzzFeed({
  bzz
});

async function run() {
  const alice = new _client.default();

  const aliceWriter = _docSync.DocWriter.create({
    bzz: new _bzzFeed.BzzFeed({
      bzz,
      signBytes: bytes => Promise.resolve((0, _secp256k.sign)(bytes, alice.keyPair))
    }),
    feed: {
      user: alice.address
    }
  });

  const bob = new _client.default();

  const bobWriter = _docSync.DocWriter.create({
    bzz: new _bzzFeed.BzzFeed({
      bzz,
      signBytes: bytes => Promise.resolve((0, _secp256k.sign)(bytes, bob.keyPair))
    }),
    feed: {
      user: bob.address
    }
  });

  aliceWriter.change(doc => {
    doc.alice = 'Hello';
  });
  bobWriter.change(doc => {
    doc.bob = 'Hello';
  });
  await Promise.all([aliceWriter.push(), bobWriter.push()]);
  const serverFeed = await alice.setDoc('alice-bob', [aliceWriter.metaFeed, bobWriter.metaFeed]);
  const serverReader = await _docSync.DocReader.load({
    bzz: bzzFeed,
    feed: serverFeed
  });
  console.log('server doc', serverReader.value);
}

run().catch(console.error);