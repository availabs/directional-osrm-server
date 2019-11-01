#!/usr/bin/env node

const _ = require('lodash');
const request = require('request-promise-native');

const HOST = 'http://127.0.0.1:5000';

const getRouteNodesForLocations = async (dataRequest = {}) => {
  const { locations, radius, snapping, continue_straight = true } = dataRequest;

  const lnstr = locations.map(({ lon, lat }) => `${lon},${lat}`).join(';');

  let queryParams = `?annotations=true&continue_straight=${continue_straight}`;

  if (!_.isNil(radius)) {
    queryParams += `&radiuses=${_.fill(Array(locations.length), radius)}`;
  }

  if (!_.isNil(snapping)) {
    queryParams += `&snapping=${snapping}`;
  }

  const options = {
    method: 'GET',
    uri: `${HOST}/route/v1/driving/${lnstr}${queryParams}`,
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

const getMatchedNodesForCoordinates = async (dataRequest = {}) => {
  const {
    coordinates,
    tidy,
    radius,
    generate_hints,
    hints,
    snapping
  } = dataRequest;

  if (!Array.isArray(coordinates)) {
    throw new Error('ERROR: Coordinates are required');
  }

  const lnstr = coordinates.map(([lon, lat]) => `${lon},${lat}`).join(';');

  let queryParams = '?annotations=true';

  if (!_.isNil(tidy)) {
    queryParams += `&tidy=${tidy}`;
  }

  if (!_.isNil(radius)) {
    queryParams += `&radiuses=${_.fill(Array(coordinates.length), radius)}`;
  }

  if (!_.isNil(generate_hints)) {
    queryParams += `&generate_hints=${generate_hints}`;
  }

  if (!_.isNil(hints)) {
    queryParams += `&hints=${hints}`;
  }

  if (!_.isNil(snapping)) {
    queryParams += `&snapping=${snapping}`;
  }

  const options = {
    method: 'GET',
    uri: `${HOST}/match/v1/driving/${lnstr}${queryParams}`,
    headers: {
      'User-Agent': 'Request-Promise'
    },
    json: true // Automatically parses the JSON string in the response
  };

  const response = await request(options);

  if (_.upperCase(response.code) !== 'OK') {
    throw Error(`OSRM match response code: ${response.code}`);
  }

  const { matchings } = response;

  const nodes = _(matchings)
    .map('legs')
    .flatten()
    .map('annotation.nodes')
    .flatten()
    .value()
    .reduce((acc, nodeId, i, arr) => {
      if (nodeId !== arr[i - 1]) {
        acc.push(nodeId);
      }
      return acc;
    }, []);

  const confidences = _.map(matchings, 'confidence');

  console.error(JSON.stringify({ nodes, confidences }, null, 4));
  return { nodes, confidences };
};

module.exports = {
  getRouteNodesForLocations,
  getMatchedNodesForCoordinates
};
