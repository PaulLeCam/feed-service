"use strict";

exports.__esModule = true;
exports.checkAddress = checkAddress;
exports.checkSignature = checkSignature;
exports.checkPayload = checkPayload;
exports.signPayload = signPayload;
exports.hashFeeds = hashFeeds;

var _hex = require("@erebos/hex");

var _keccak = require("@erebos/keccak256");

var _secp256k = require("@erebos/secp256k1");

const FEED_ZERO_TOPIC = Buffer.alloc(32);

function checkAddress(address, key) {
  const pubKey = typeof key === 'string' ? (0, _secp256k.createPublic)(key) : key;
  return address === (0, _keccak.pubKeyToAddress)(pubKey.getPublic('array'));
}

function checkSignature(req) {
  return (0, _secp256k.verify)(_hex.Hex.from(req.payload).toBytesArray(), _hex.Hex.from(req.signature).toBytesArray(), req.key);
}

function checkPayload(req) {
  const data = _hex.Hex.from(req.payload);

  const sig = _hex.Hex.from(req.signature).toBytesArray();

  return (0, _secp256k.verify)(data.toBytesArray(), sig, req.key) ? data.toObject() : null;
}

function signPayload(key, data) {
  const payload = _hex.Hex.from(data);

  const signature = (0, _secp256k.sign)(payload.toBytesArray(), key);
  return {
    key: key.getPublic('hex'),
    payload: payload.value,
    signature: _hex.Hex.from(signature).value
  };
}

function hashFeeds(feeds) {
  const buffers = feeds.map(feed => {
    return Buffer.concat([_hex.Hex.from(feed.user).toBuffer(), feed.topic ? _hex.Hex.from(feed.topic).toBuffer() : FEED_ZERO_TOPIC]);
  });
  const hashed = (0, _keccak.hash)(Buffer.concat(buffers));
  return _hex.Hex.from(hashed).value;
}