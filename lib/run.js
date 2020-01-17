"use strict";

var _bzzFeed = require("@erebos/bzz-feed");

var _bzzNode = require("@erebos/bzz-node");

var _secp256k = require("@erebos/secp256k1");

var _micro = _interopRequireDefault(require("micro"));

var _operators = require("rxjs/operators");

var _client = _interopRequireDefault(require("./client"));

var _server = _interopRequireDefault(require("./server"));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

const POLL_OPTIONS = {
  changedOnly: true,
  interval: 2000,
  mode: 'raw'
};
(0, _micro.default)(_server.default).listen(3000);
const bzzFeed = new _bzzFeed.BzzFeed({
  bzz: new _bzzNode.BzzNode({
    url: 'http://localhost:8500'
  }),
  signBytes: (bytes, key) => Promise.resolve((0, _secp256k.sign)(bytes, key))
});
const parseText = (0, _operators.flatMap)(async res => {
  return res ? await (0, _bzzNode.resText)(res) : null;
});

async function setContent(client, text) {
  return await bzzFeed.setContent({
    user: client.address
  }, text, undefined, client.keyPair);
}

async function run() {
  const alice = new _client.default();
  const bob = new _client.default();
  console.log('User feeds:', {
    alice: alice.address,
    bob: bob.address
  });
  const [sharedServerFeed, singleServerFeed] = await Promise.all([alice.setFeed('alice-bob', [{
    user: alice.address
  }, {
    user: bob.address
  }]), bob.setFeed('hello', [{
    user: bob.address
  }]), setContent(alice, 'Hello from Alice'), setContent(bob, 'Hello from Bob')]);
  bzzFeed.pollContent(sharedServerFeed, POLL_OPTIONS).pipe(parseText).subscribe({
    next: text => {
      console.log('Shared (Alice and Bob) server feed text:', text);

      if (text === 'Hello from Alice') {
        setContent(bob, 'Bob also says hello');
      } else if (text === 'Hello from Bob') {
        setContent(alice, 'Alice also says hello');
      }
    }
  });
  bzzFeed.pollContent(singleServerFeed, POLL_OPTIONS).pipe(parseText).subscribe({
    next: text => {
      console.log('Single (Bob) server feed text:', text);
    }
  });
}

run().catch(console.error);