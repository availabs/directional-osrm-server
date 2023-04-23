#!/usr/bin/env node

/* eslint no-param-reassign: 0, no-restricted-syntax: 0, no-continue: 0, operator-assignment: 0 */

const { inspect } = require("util");

const _ = require("lodash");
const request = require("request-promise-native");

const osrm_routing_servers = require("../../config/osrm_routing_servers");

const logger = require("../logger");

const getRouteNodesForLocations = async (
  conflation_map_version = "2019_v0_4_2",
  dataRequest = {}
) => {
  const host = osrm_routing_servers[conflation_map_version];

  if (!host) {
    throw new Error(
      `Unsupported ConflationMap version ${conflation_map_version}. The supported versions are ${Object.keys(
        osrm_routing_servers
      )}.`
    );
  }

  const { locations, radius, snapping, continue_straight = true } = dataRequest;

  const lnstr = locations.map(({ lon, lat }) => `${lon},${lat}`).join(";");

  let queryParams = `?annotations=true&continue_straight=${continue_straight}&steps=true&overview=full&geometries=geojson`;

  if (!_.isNil(radius)) {
    queryParams += `&radiuses=${_.fill(Array(locations.length), radius)}`;
  }

  if (!_.isNil(snapping)) {
    queryParams += `&snapping=${snapping}`;
  }

  const options = {
    method: "GET",
    uri: `${host}/route/v1/driving/${lnstr}${queryParams}`,
    headers: {
      "User-Agent": "Request-Promise",
    },
    json: true, // Automatically parses the JSON string in the response
  };

  logger.trace(`OSRM Request: ${JSON.stringify(options, null, 4)}`);

  const response = await request(options);

  logger.trace(`OSRM Response: ${JSON.stringify(response, null, 4)}`);

  logger.debug(`==> routes.length=${response.routes.length}`);
  const {
    routes: [{ legs, geometry }],
  } = response;

  const traversed_nodes = [];

  // The following two are parallel arrays
  const traversed_ways = [];
  const traversed_way_node_ids = [];

  const node_by_coords = {};

  let node_idx = 0;

  logger.debug(
    `==> geometry.coordinates.length=${geometry.coordinates.length}`
  );

  let leg_idx = 0;
  for (const leg of legs) {
    let new_leg = true;

    const {
      annotation: { nodes },
      steps,
    } = leg;

    logger.trace(`==> leg_idx=${leg_idx++}`);

    // If node_idx !== 0, we are past the first leg.
    // The nodes for a new leg can jump back a couple.
    // We need to update the node_idx accordingly.
    if (node_idx && new_leg) {
      const [leg_start_node] = nodes;
      const traversed_last_idx_of_leg_start = traversed_nodes.lastIndexOf(
        leg_start_node
      );

      if (traversed_last_idx_of_leg_start === -1) {
        continue;
      }

      const traversed_tail = traversed_nodes.slice(
        traversed_last_idx_of_leg_start
      );

      const leg_head = nodes.slice(
        0,
        traversed_nodes.length - traversed_last_idx_of_leg_start
      );

      if (_.isEqual(traversed_tail, leg_head)) {
        node_idx = traversed_last_idx_of_leg_start;
        traversed_nodes.length = traversed_nodes.length - traversed_tail.length;
      }
    }

    new_leg = false;

    for (let i = 0; i < nodes.length; ++i) {
      const node = nodes[i];

      if (_.last(traversed_nodes) !== node) {
        traversed_nodes.push(node);

        const [lon, lat] = geometry.coordinates[node_idx];
        const k = `${lon} ${lat}`;
        node_by_coords[k] = node;

        ++node_idx;
      }
    }

    for (const {
      name: way,
      geometry: { coordinates },
    } of steps) {
      let node_ids_arr;
      if (way && _.last(traversed_ways) !== way) {
        traversed_ways.push(way);
        node_ids_arr = [];
        traversed_way_node_ids.push(node_ids_arr);
      } else {
        node_ids_arr = _.last(traversed_way_node_ids);
      }

      for (const [lon, lat] of coordinates) {
        const k = `${lon} ${lat}`;
        const node_id = node_by_coords[k];

        if (node_id !== _.last(node_ids_arr)) {
          node_ids_arr.push(node_id);
        }
      }
    }
  }

  const result = {
    nodes: traversed_nodes,
    ways: traversed_ways,
    way_node_ids: traversed_way_node_ids,
    geometry,
  };

  return result;
};

module.exports = {
  getRouteNodesForLocations,
};
