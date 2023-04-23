/* eslint no-param-reassign: 0, no-restricted-syntax: 0, no-continue: 0, no-underscore-dangle: 0 */

const { writeFileSync } = require("fs");
const { join } = require("path");

const dedent = require("dedent");
const _ = require("lodash");

const { Graph, alg: GraphAlgorithms } = require("@dagrejs/graphlib");

const pgFormat = require("pg-format");

const { getDb } = require("./Database");
const logger = require("../logger");

let req_ctr = 0;

const FWD = 1;
const BWD = 0;

/** For debugging. Writes the OSRM response osrm_response_geom to a file viewable in QGIS. */
function writeOsrmResponseGeometryToFile(osrm_response_geom) {
  if (process.env.AVAIL_LOGGING_LEVEL === "trace") {
    // const geojson_file_name = "osrm_response_geometry.geojson";
    const geojson_file_name = `osrm_response_geometry.${
      new Date().toISOString().replace(/[^0-9a-z]/gi, "").geojson
    }`;

    const geojson_file_path = join(__dirname, "../../", geojson_file_name);

    writeFileSync(
      geojson_file_path,
      JSON.stringify(
        {
          type: "Feature",
          geometry: osrm_response_geom,
          properties: { timestamp: new Date() },
        },
        null,
        4
      )
    );
    logger.trace(`WROTE RESPONSE FILE: ${geojson_file_path}`);
  }
}

/** Uses the OSRM response osrm_response_geom to create a buffer and get all OSM ways in that buffer. */
async function getOsmWaysForOsrmResponseGeometry(
  conflation_map_version,
  osrm_response_geom
) {
  const db = await getDb();

  logger.debug(
    "requesting conflation map ways for OSRM response osrm_response_geom"
  );

  const [
    conflation_map_year,
    conflation_platform_version,
  ] = conflation_map_version.split(/_(.*)/);

  // https://github.com/availabs/NPMRDS_Database/blob/master/sql/osm/create_osm_way_is_roadway_fn.sql
  // https://gis.stackexchange.com/a/345681
  const query_osm_ways_sql = dedent(
    pgFormat(
      `
        SELECT DISTINCT ON (a.id)

            a.id                                    AS cway_id,
            a.osm                                   AS osm_way_id,
            a.osm_fwd,
            c.node_ids                              AS c_node_ids

          FROM conflation.%I AS a
            INNER JOIN (
              SELECT
                  ST_Subdivide(
                    ST_Buffer(
                      ST_SetSRID(
                        ST_GeomFromGeoJSON($1),
                        4326
                      ),
                      0.00001,
                      'endcap=round join=round'
                    )
                  ) AS wkb_geometry
            ) AS b
              ON (
                ST_Intersects(
                  a.wkb_geometry,
                  b.wkb_geometry
                )
              )
            INNER JOIN conflation.%I AS c
              USING (id)
        ;
      `,
      `conflation_map_${conflation_map_version}`,
      `conflation_map_${conflation_map_year}_ways_${conflation_platform_version}`
    )
  );

  const { rows: cways_for_osrm_geom } = await db.query({
    // name: `GET OSM WAYS ${osm_map_version}`,
    text: query_osm_ways_sql,
    values: [osrm_response_geom],
  });

  logger.debug("got conflation map ways for OSRM response osrm_response_geom");

  return cways_for_osrm_geom;
}

/** Uses the OSRM response osrm_response_geom to create a buffer and get all OSM ways in that buffer. */
async function getTmcSequenceForConflationMapWayIdSeq(
  conflation_map_version,
  cmap_ways_path
) {
  const db = await getDb();

  logger.debug(
    "requesting conflation map ways for OSRM response osrm_response_geom"
  );

  const [year] = conflation_map_version.match(/\d{4}/);

  const text = dedent(
    pgFormat(
      `
        SELECT
            a.id          AS cway_id,

            a.tmc,

            b.startlong   AS v_lon,
            b.startlat    AS v_lat,
            b.endlong     AS w_lon,
            b.endlat      AS w_lat

          FROM conflation.%I AS a
            INNER JOIN
              UNNEST($1::INTEGER[])
                WITH ORDINALITY AS t(id, idx)
              USING (id)
            INNER JOIN ny.%I AS b
              USING (tmc)
          ORDER BY t.idx

      `,
      `conflation_map_${conflation_map_version}`,
      `tmc_metadata_${year}`
    )
  );

  const { rows: result } = await db.query({
    // name: `GET OSM WAYS ${osm_map_version}`,
    text,
    values: [cmap_ways_path],
  });

  const tmcs_by_cway_id = {};
  const toposorted_tmcs = [];
  const tmcs_to_nodes = {};
  const tmc_lookup_by_nodes = {};

  // We need to toposort the conflation map ways for each direction of the OSM way.
  for (const {
    cway_id,
    tmc,
    v_lon: _v_lon,
    v_lat: _v_lat,
    w_lon: _w_lon,
    w_lat: _w_lat,
  } of result) {
    tmcs_by_cway_id[cway_id] = tmc;

    if (_.last(toposorted_tmcs) !== tmc) {
      toposorted_tmcs.push(tmc);
    }

    const v_lon = Math.round(_v_lon * 100000);
    const v_lat = Math.round(_v_lat * 100000);

    const w_lon = Math.round(_w_lon * 100000);
    const w_lat = Math.round(_w_lat * 100000);

    const v_node = `${v_lon} ${v_lat}`;
    const w_node = `${w_lon} ${w_lat}`;

    tmcs_to_nodes[tmc] = { v_node, w_node };

    tmc_lookup_by_nodes[v_node] = tmc_lookup_by_nodes[v_node] || {};
    tmc_lookup_by_nodes[v_node][w_node] = tmc;
  }

  if (toposorted_tmcs.length < 2) {
    return toposorted_tmcs;
  }

  const path = [];

  for (let i = 0; i < toposorted_tmcs.length; ++i) {
    const cur = toposorted_tmcs[i];

    const { v_node: cur_v_node, w_node: cur_w_node } = tmcs_to_nodes[cur];

    const prev = _.last(path);

    if (prev) {
      const { w_node: prev_w_node } = tmcs_to_nodes[prev];

      const prev_successors = Object.values(
        tmc_lookup_by_nodes[prev_w_node] || {}
      );

      if (prev_successors.length > 1) {
        if (prev_w_node !== cur_v_node) {
          logger.trace(
            `cur=${cur} cur_v_node=${cur_v_node} prev=${prev} prev_w_node=${prev_w_node} prev_successors.lenght=${prev_successors.length}`
          );
          continue;
        }

        const cur_has_successors = tmc_lookup_by_nodes[cur_w_node];
        if (i < toposorted_tmcs.length - 1 && !cur_has_successors) {
          logger.trace(`!cur=${cur} has no successors`);
          continue;
        }
      }
    }

    path.push(cur);
  }

  logger.trace(
    JSON.stringify(
      {
        tmcs_by_cway_id,
        toposorted_tmcs,
        tmc_lookup_by_nodes,
        tmcs_to_nodes,
        path,
      },
      null,
      4
    )
  );

  return path;
}

// https://www.geeksforgeeks.org/longest-common-subsequence-dp-4/
// Returns length of LCS for X[0..m-1], Y[0..n-1]
function lcs(X, Y) {
  const m = X.length;
  const n = Y.length;

  const L = new Array(m + 1);

  for (let i = 0; i < L.length; i++) {
    L[i] = new Array(n + 1);
  }

  // Following steps build L[m+1][n+1] in bottom up fashion.
  // Note that L[i][j] contains length of LCS of X[0..i-1] and Y[0..j-1]
  for (let i = 0; i <= m; i++) {
    for (let j = 0; j <= n; j++) {
      if (i === 0 || j === 0) L[i][j] = 0;
      else if (X[i - 1] === Y[j - 1]) L[i][j] = L[i - 1][j - 1] + 1;
      else L[i][j] = Math.max(L[i - 1][j], L[i][j - 1]);
    }
  }

  // L[m][n] contains length of LCS for X[0..n-1] and Y[0..m-1]
  return L[m][n];
}

const best_match_dir = (way_node_ids, cways_fwd, cways_bwd) => {
  if (cways_fwd && !cways_bwd) {
    return FWD;
  }

  if (!cways_fwd && cways_bwd) {
    return BWD;
  }

  const cways_fwd_nodes = _.flatten(
    cways_fwd.map(({ c_node_ids }) => c_node_ids)
  ).map((n_id) => +n_id);

  const cways_bwd_nodes = _.flatten(
    cways_bwd.map(({ c_node_ids }) => c_node_ids)
  ).map((n_id) => +n_id);

  const fwd_lcs = lcs(way_node_ids, cways_fwd_nodes);
  const bwd_lcs = lcs(way_node_ids, cways_bwd_nodes);

  return +(fwd_lcs >= bwd_lcs);
};

async function getConflationMapWays(
  conflation_map_version,
  {
    nodes: osrm_response_nodes_seq,
    ways: osrm_response_ways_seq,
    way_node_ids: osrm_response_ways_node_ids,
    geometry: osrm_response_geom,
  },
  dataRequest,
  return_tmcs
) {
  const osrm_traversed_ways_set = new Set(
    osrm_response_ways_seq.map((w) => +w)
  );

  const req_num = ++req_ctr;
  const req_name = `==> getConflationMapWays: req ${req_num}, num nodes: ${osrm_response_nodes_seq.length}`;

  writeOsrmResponseGeometryToFile(osrm_response_geom);

  try {
    osrm_response_nodes_seq = osrm_response_nodes_seq.map((n) => +n);

    console.log(req_name);
    console.time(req_name);

    const cways_for_osrm_geom = await getOsmWaysForOsrmResponseGeometry(
      conflation_map_version,
      osrm_response_geom
    );

    const cways_by_id = cways_for_osrm_geom.reduce((acc, d) => {
      const { cway_id } = d;

      acc[cway_id] = d;

      return acc;
    }, {});

    const cways_by_osm_dir_by_osm_way_id = cways_for_osrm_geom.reduce(
      (acc, d) => {
        const { osm_way_id, osm_fwd } = d;

        acc[osm_way_id] = acc[osm_way_id] || {};
        acc[osm_way_id][osm_fwd] = acc[osm_way_id][osm_fwd] || [];
        acc[osm_way_id][osm_fwd].push(d);

        return acc;
      },
      {}
    );

    // We need to toposort the conflation map ways for each direction of the OSM way.
    for (let osm_way_id of Object.keys(cways_by_osm_dir_by_osm_way_id)) {
      // FIXME: We'll have to change this to handle gaps in OSRM response.
      if (!osrm_traversed_ways_set.has(+osm_way_id)) {
        continue;
      }

      osm_way_id = +osm_way_id;

      const cways_by_osm_dir = cways_by_osm_dir_by_osm_way_id[osm_way_id];

      for (const dir of Object.keys(cways_by_osm_dir)) {
        const d = cways_by_osm_dir[dir];

        if (d.length === 1) {
          continue;
        }

        const g = new Graph({
          directed: true,
          // multigraph: true,
          compound: false,
        });

        const lookup = {};

        for (const { cway_id, c_node_ids } of d) {
          const v_node = _.first(c_node_ids);
          const w_node = _.last(c_node_ids);

          lookup[v_node] = lookup[v_node] || {};
          lookup[v_node][w_node] = cway_id;

          // g.setEdge(v_node, w_node, cway_id, cway_id);
          g.setEdge(v_node, w_node, cway_id);
        }

        if (!GraphAlgorithms.isAcyclic(g)) {
          // TODO: Order the cways when cyclic
          logger.debug(`osm_way ${osm_way_id} dir ${dir} IS CYCLIC`);
          continue;
        }

        const toposorted = GraphAlgorithms.topsort(g);

        const toposorted_cways = [];

        for (let i = 1; i < toposorted.length; ++i) {
          const v = toposorted[i - 1];
          const w = toposorted[i];

          const cway_id = lookup[v][w];

          toposorted_cways.push(cways_by_id[cway_id]);
        }

        cways_by_osm_dir[dir] = toposorted_cways;
      }
    }

    const path = [];

    let prev_last;
    for (let i = 0; i < osrm_response_ways_seq.length; ++i) {
      const osm_way_id = osrm_response_ways_seq[i];
      let traversed_osm_node_ids = osrm_response_ways_node_ids[i];

      const cways_by_osm_dir = cways_by_osm_dir_by_osm_way_id[osm_way_id];

      const best_dir = best_match_dir(
        traversed_osm_node_ids,
        cways_by_osm_dir[FWD],
        cways_by_osm_dir[BWD]
      );

      const cways = cways_by_osm_dir[best_dir];

      if (prev_last) {
        const prev_last_idx = traversed_osm_node_ids.indexOf(prev_last);
        if (prev_last_idx > -1) {
          traversed_osm_node_ids = traversed_osm_node_ids.slice(
            prev_last_idx + 1
          );
        }
      }

      const path_arr = [];
      let remaining_osm_node_ids = traversed_osm_node_ids;

      for (let j = 0; j < cways.length; ++j) {
        if (remaining_osm_node_ids.length === 0) {
          break;
        }

        const cway = cways[j];

        const c_node_ids = cway.c_node_ids.map((nid) => +nid);

        if (_.last(c_node_ids) === prev_last) {
          continue;
        }

        path_arr.push(cway);

        remaining_osm_node_ids = _.difference(
          remaining_osm_node_ids,
          c_node_ids
        );

        prev_last = _.last(c_node_ids);
      }

      // prev_last = _.last(_.last(path_arr).c_node_ids);

      path.push(path_arr);
    }

    const cmap_ways_path = _.flattenDeep(path).map(({ cway_id }) => +cway_id);

    console.timeEnd(req_name);

    if (return_tmcs) {
      const tmcs_path = await getTmcSequenceForConflationMapWayIdSeq(
        conflation_map_version,
        cmap_ways_path
      );

      const [year] = conflation_map_version.match(/\d{4}/);

      // We log this to help developers visually inspect the response.
      const tmc_qa_sql = dedent(`-- QA SQL for QGIS
        SELECT
          tmc, wkb_geometry, idx
        FROM ny.npmrds_shapefile_${year}
          INNER JOIN
            UNNEST(ARRAY[${tmcs_path.map((id) => `'${id}'`)}])
              WITH ORDINALITY AS t(tmc, idx)
            USING (tmc)
        ;
      `);

      logger.debug(tmc_qa_sql);

      return tmcs_path;
    }

    // We log this to help developers visually inspect the response.
    const qa_sql = dedent(`-- QA SQL for QGIS
      SELECT
        id, wkb_geometry, idx
      FROM conflation.conflation_map_${conflation_map_version}
        INNER JOIN
          UNNEST(ARRAY[${cmap_ways_path}])
            WITH ORDINALITY AS t(id, idx)
          USING (id)
      ;
    `);

    logger.debug(qa_sql);

    return cmap_ways_path;
  } catch (err) {
    logger.error("!".repeat(20));
    logger.error(err);
    logger.error(JSON.stringify({ dataRequest }, null, 4));
    logger.error("!".repeat(20));
    throw err;
  }
}

module.exports = {
  getConflationMapWays,
};
