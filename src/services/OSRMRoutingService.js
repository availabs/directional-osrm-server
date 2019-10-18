#!/usr/bin/env node

const request = require('request-promise-native');
// const _ = require('lodash');

const HOST = 'http://127.0.0.1:5000';

// const locations = [
// // UAlbany
// { lat: 42.688188, lon: -73.823153 },
// // Pho Yum
// { lat: 42.715296, lon: -73.830533 },
// // Hannaford
// { lat: 42.71651, lon: -73.812453 }
// // // Rensselaer Walmart
// // { lat: 42.641411, lon: -73.699788 }
// ]

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
    routes: [
      {
        legs: [
          {
            annotation: { nodes }
          }
        ]
      }
    ]
  } = response;

  return nodes.reduce((acc, nodeId, i, arr) => {
    if (nodeId !== arr[i - 1]) {
      acc.push(nodeId);
    }
    return acc;
  }, []);
};

module.exports = {
  getRouteNodesForLocations
};
