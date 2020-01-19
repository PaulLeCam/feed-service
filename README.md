# Feed service POC

Proof-of-Concept implementation of an aggregation service for Swarm feeds.

The service is a HTTP server where users can set feeds aggregating other feeds under their own address space.
Authorization is handled by signing payloads when mutating the address space, so there is no need for additional tools than the ones already used for feeds.

## Running

- Run `yarn` to install the dependencies
- Run `yarn run-docs` to start the server and make example client calls for doc-sync
- Run `yarn run-feeds` to start the server and make example client calls for feeds
