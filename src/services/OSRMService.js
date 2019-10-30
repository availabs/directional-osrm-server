#!/usr/bin/env node

const _ = require('lodash');
const request = require('request-promise-native');

const HOST = 'http://127.0.0.1:5000';

const getRouteNodesForLocations = async locations => {
  const locs = locations.map(({ lat, lon }) => `${lon},${lat}`).join(';');

  const options = {
    method: 'GET',
    uri: `${HOST}/route/v1/driving/${locs}?annotations=true`,
    headers: {
      'User-Agent': 'Request-Promise'
    },
    json: true // Automatically parses the JSON string in the response
  };

  const response = await request(options);

  const {
    routes: [{ legs }]
  } = response;

  const nodes = _.flatten(legs.map(({ annotation: { nodes: n } }) => n));

  return nodes.reduce((acc, nodeId, i, arr) => {
    if (nodeId !== arr[i - 1]) {
      acc.push(nodeId);
    }
    return acc;
  }, []);
};

const getMatchedNodesForCoordinates = async coordinates => {
  const locs = coordinates.map(([lon, lat]) => `${lon},${lat}`).join(';');

  const options = {
    method: 'GET',
    uri: `${HOST}/match/v1/driving/${locs}?annotations=true&snapping=any`,
    headers: {
      'User-Agent': 'Request-Promise'
    },
    json: true // Automatically parses the JSON string in the response
  };

  const response = await request(options);

  const {
    matchings: [{ legs }]
  } = response;

  const nodes = _.flatten(legs.map(({ annotation: { nodes: n } }) => n));

  return nodes.reduce((acc, nodeId, i, arr) => {
    if (nodeId !== arr[i - 1]) {
      acc.push(nodeId);
    }
    return acc;
  }, []);
};

module.exports = {
  getRouteNodesForLocations,
  getMatchedNodesForCoordinates
};
