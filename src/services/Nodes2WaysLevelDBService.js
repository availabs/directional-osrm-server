#!/usr/bin/env node

/* eslint no-param-reassign: 0 */

const { join } = require('path');

const levelup = require('levelup');
const leveldown = require('leveldown');
const encode = require('encoding-down');

const dbDir = join(__dirname, '../../data/levelDBs/conflationNodes2Ways');
const JSON_ENC = { valueEncoding: 'json' };

/*
  {
    <node_id>: {
      <way_id>: [ <node_index_0>, ... ]
    }
  }
*/
const conflationNodes2WaysDB = levelup(encode(leveldown(dbDir), JSON_ENC));

const getNodes2Ways = async nodeIds => {
  const d = await Promise.all(
    nodeIds.map(async nodeId => {
      try {
        return await conflationNodes2WaysDB.get(nodeId);
      } catch (err) {
        return null;
      }
    })
  );

  return d.reduce((acc, node2Ways, i) => {
    const nodeId = nodeIds[i];
    acc[nodeId] = node2Ways;
    return acc;
  }, {});
};

module.exports = {
  getNodes2Ways
};
