#!/usr/bin/env node

/* eslint no-param-reassign: 0, no-restricted-syntax: 0 */

const _ = require('lodash');
const request = require('request-promise-native');

const osrm_routing_servers = require('../../config/osrm_routing_servers');

const getRouteNodesForLocations = async (
  conflation_map_version = '2019_v0_4_2',
  dataRequest = {},
) => {
  const host = osrm_routing_servers[conflation_map_version];

  if (!host) {
    throw new Error(
      `Unsupported ConflationMap version ${conflation_map_version}. The supported versions are ${Object.keys(
        config,
      )}.`,
    );
  }

  const { locations, radius, snapping, continue_straight = true } = dataRequest;

  const lnstr = locations.map(({ lon, lat }) => `${lon},${lat}`).join(';');

  let queryParams = `?annotations=true&continue_straight=${continue_straight}&steps=true&overview=full&geometries=geojson`;

  if (!_.isNil(radius)) {
    queryParams += `&radiuses=${_.fill(Array(locations.length), radius)}`;
  }

  if (!_.isNil(snapping)) {
    queryParams += `&snapping=${snapping}`;
  }

  const options = {
    method: 'GET',
    uri: `${host}/route/v1/driving/${lnstr}${queryParams}`,
    headers: {
      'User-Agent': 'Request-Promise',
    },
    json: true, // Automatically parses the JSON string in the response
  };

  const response = await request(options);

  const {
    routes: [{ legs, geometry }],
  } = response;

  const traversed_nodes = [];

  for (const leg of legs) {
    const {
      annotation: { nodes },
    } = leg;

    for (const node of nodes) {
      if (_.last(traversed_nodes) !== node) {
        traversed_nodes.push(node);
      }
    }
  }

  const result = {
    nodes: traversed_nodes,
    geometry,
  };

  return result;
};

module.exports = {
  getRouteNodesForLocations,
};
