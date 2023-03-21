/* eslint no-param-reassign: 0, no-restricted-syntax: 0 */

/*
-- You inspect the results in QGIS with the following query:

  SELECT
    id, wkb_geometry, idx
  FROM conflation.conflation_map_<version>
    INNER JOIN
      -- Copy the response's IDs into the below ARRAY
      UNNEST(ARRAY[])
        WITH ORDINALITY AS t(id, idx)
      USING (id)
  ;
*/

const { Pool } = require("pg");

const dedent = require("dedent");
const _ = require("lodash");

const { Graph, alg: GraphAlgorithms } = require("@dagrejs/graphlib");

const createGraph = require("ngraph.graph");
const path = require("ngraph.path");

const pgFormat = require("pg-format");

// NOTE: credentials put into process.env by dotenv in ../../index.js
const db = new Pool({ max: 10 });
const is_connected = db.connect();

let req_ctr = 0;

async function getConflationMapWays(
  conflation_map_version,
  { nodes, geometry },
  dataRequest
) {
  try {
    nodes = nodes.map((n) => +n);

    const req_num = ++req_ctr;
    const req_name = `getConflationMapWays: req ${req_num}`;

    console.log(`==> ${req_name}; num nodes: ${nodes.length}`);
    console.time(req_name);

    await is_connected;

    const query_osm_map_version_sql = dedent(`
    SELECT
        osm_map_version
      FROM conflation.conflation_map_osm_version
      WHERE ( conflation_map_version = $1 )
  `);

    const {
      rows: [{ osm_map_version = null } = {}],
    } = await db.query(query_osm_map_version_sql, [conflation_map_version]);

    if (!conflation_map_version) {
      throw new Error(
        `Unsupported conflation_map_version: ${conflation_map_version}`
      );
    }

    const query_timer = `database query_osm_ways: req ${req_num}`;

    console.time(query_timer);

    // https://github.com/availabs/NPMRDS_Database/blob/master/sql/osm/create_osm_way_is_roadway_fn.sql
    // https://gis.stackexchange.com/a/345681
    const query_osm_ways_sql = dedent(
      pgFormat(
        `
        SELECT DISTINCT ON (a.id)
            a.id AS osm_way_id,
            a.node_ids AS osm_node_ids
          FROM osm.%I AS a
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
          WHERE ( osm.osm_way_is_roadway(tags) )
        ;
      `,
        `osm_ways_v${osm_map_version}`
      )
    );

    const { rows: osm_ways_result } = await db.query({
      // name: `GET OSM WAYS ${osm_map_version}`,
      text: query_osm_ways_sql,
      values: [geometry],
    });

    console.timeEnd(query_timer);

    const g = createGraph({ oriented: false });

    const osm_node_ids_by_way_id = osm_ways_result.reduce(
      (acc, { osm_way_id, osm_node_ids }) => {
        acc[osm_way_id] = osm_node_ids;
        return acc;
      },
      {}
    );

    const osm_way_lookup = {};

    const seen_osm_nodes = new Set();

    const seen_osm_ways = new Set();

    for (const { osm_way_id, osm_node_ids } of osm_ways_result) {
      seen_osm_ways.add(+osm_way_id);

      for (let i = 1; i < osm_node_ids.length; ++i) {
        const v = +osm_node_ids[i - 1];
        const w = +osm_node_ids[i];

        seen_osm_nodes.add(v);
        seen_osm_nodes.add(w);

        osm_way_lookup[v] = osm_way_lookup[v] || {};

        if (osm_way_lookup[v][w] && osm_way_lookup[v][w] !== osm_way_id) {
          // console.warn('DUPE EDGE.');
        } else {
          osm_way_lookup[v][w] = +osm_way_id;
        }

        // FIXME??? Should this be in the above else block?
        g.addLink(v, w);
      }
    }

    const path_finder = path.aStar(g);

    const edge_path = new Set();

    // Not all OSM nodes are in the conflation map. (crosswalk nodes, for example)
    const start_node_idx = nodes.findIndex((n) => seen_osm_nodes.has(n));
    let source = nodes[start_node_idx];

    const backwards_osm_ways = new Set();

    for (const dest of nodes.slice(start_node_idx + 1)) {
      if (!seen_osm_nodes.has(dest)) {
        continue;
      }

      const found_path =
        path_finder.find(source, dest) || path_finder.find(dest, source);

      if (!found_path) {
        console.log("NO found_path");
        continue;
      }

      const found_path_nodes = found_path.map(({ id }) => +id);

      if (
        _.last(found_path_nodes) === +source &&
        _.first(found_path_nodes) === +dest
      ) {
        found_path_nodes.reverse();
      }

      for (let i = 0; i < found_path_nodes.length - 1; ++i) {
        const v = found_path_nodes[i];
        const w = found_path_nodes[i + 1];

        const e = osm_way_lookup[v] && osm_way_lookup[v][w];

        if (e) {
          edge_path.add(e);
        } else {
          const e2 = osm_way_lookup[w] && osm_way_lookup[w][v];

          if (e2) {
            backwards_osm_ways.add(e2);
            edge_path.add(e2);
          }
        }
      }

      source = dest;
    }

    const edges = [...edge_path];

    const osm_way_w_dirs = edges.map((e) => ({
      osm: +e,
      osm_fwd: +!backwards_osm_ways.has(e),
    }));

    // https://stackoverflow.com/a/4607799
    const [
      conflation_map_year,
      conflation_platform_version,
    ] = conflation_map_version.split(/_(.*)/);

    const sql2 = dedent(
      pgFormat(
        `
      SELECT
          a.id                                    AS cfl_way_id,
          (b.idx - 1)::INTEGER                    AS osm_path_idx,
          c.node_ids[1]                           AS v_node,
          c.node_ids[array_upper(c.node_ids, 1)]  AS w_node
        FROM conflation.%I AS a
          INNER JOIN UNNEST($1::JSON[]) WITH ORDINALITY AS b(osm_way_desc, idx)
            ON (
              ( a.osm = (b.osm_way_desc->>'osm')::INTEGER )
              AND
              ( a.osm_fwd = (b.osm_way_desc->>'osm_fwd')::INTEGER )
            )
          INNER JOIN conflation.%I AS c
            USING (id)
    `,
        `conflation_map_${conflation_map_version}`,
        `conflation_map_${conflation_map_year}_ways_${conflation_platform_version}`
      )
    );

    const { rows: conflation_map_ways_info } = await db.query({
      // name: `GET ConflationMap Ways ${conflation_map_version}`,
      text: sql2,
      values: [osm_way_w_dirs],
    });

    if (conflation_map_ways_info.length === 0) {
      return null;
    }

    const cfl_g = new Graph({
      directed: true,
      multigraph: false,
      compound: false,
    });

    const cfl_nodes_2_edges = {};
    const rev_cfl_nodes_2_edges = {};

    for (const {
      cfl_way_id,
      osm_path_idx,
      v_node,
      w_node,
    } of conflation_map_ways_info) {
      const v = +v_node;
      const w = +w_node;

      cfl_nodes_2_edges[v] = cfl_nodes_2_edges[v] || {};
      cfl_nodes_2_edges[v][w] = { cfl_way_id, osm_path_idx };

      rev_cfl_nodes_2_edges[w] = rev_cfl_nodes_2_edges[w] || {};
      rev_cfl_nodes_2_edges[w][v] = { cfl_way_id, osm_path_idx };

      cfl_g.setEdge(v, w);
    }

    const detours = new Set();
    let progress = true;

    while (progress) {
      progress = false;

      const gcomponents = [];

      const unseen_gnodes = new Set([cfl_g.nodes()]);

      let queue = [];
      while (unseen_gnodes.size) {
        queue = queue.length ? queue : [[...unseen_gnodes][0]];

        let v;
        while ((v = queue.pop())) {
          if (!unseen_gnodes.has(v)) {
            continue;
          }

          unseen_gnodes.delete(v);

          let comp = gcomponents.find((c) => c.has(v));

          if (!comp) {
            comp = new Set(v);
            gcomponents.push(comp);
          }

          if (cfl_nodes_2_edges[v]) {
            for (const w of Object.keys(cfl_nodes_2_edges[v])) {
              if (unseen_gnodes.has(w)) {
                comp.add(w);
                queue.push(w);
              }
            }
          }

          if (rev_cfl_nodes_2_edges[v]) {
            for (const w of Object.keys(rev_cfl_nodes_2_edges[v])) {
              if (unseen_gnodes.has(w)) {
                comp.add(w);
                queue.push(w);
              }
            }
          }
        }
      }

      const components_summmary = gcomponents.map((component_nodes_set) => {
        const component = [...component_nodes_set];

        const {
          component_min_path_idx,
          component_max_path_idx,
        } = component.reduce(
          (acc, src) => {
            const d = cfl_nodes_2_edges[src];

            if (!d) {
              return acc;
            }

            const dests = Object.keys(d).map((n) => +n);

            for (const dest of dests) {
              const { osm_path_idx } = cfl_nodes_2_edges[src][dest];

              if (osm_path_idx < acc.component_min_path_idx) {
                acc.component_min_path_idx = osm_path_idx;
              }

              if (osm_path_idx > acc.component_max_path_idx) {
                acc.component_max_path_idx = osm_path_idx;
              }
            }

            return acc;
          },
          {
            component_min_path_idx: Infinity,
            component_max_path_idx: -Infinity,
          }
        );

        return {
          component_nodes_set,
          component_min_path_idx,
          component_max_path_idx,
        };
      });

      const sources = cfl_g.sources();
      const sinks = cfl_g.sinks();

      for (const src of sources) {
        const {
          component_min_path_idx,
        } = components_summmary.find(({ component_nodes_set }) =>
          component_nodes_set.has(src)
        );

        try {
          const dests = Object.keys(cfl_nodes_2_edges[src]).map((n) => +n);

          for (const dest of dests) {
            const { cfl_way_id, osm_path_idx } = cfl_nodes_2_edges[src][dest];

            if (osm_path_idx !== component_min_path_idx) {
              // console.warn('FOUND SOURCE DETOUR:', cfl_way_id);
              detours.add(cfl_way_id);
              cfl_g.removeNode(src);
              progress = true;
            }
          }
        } catch (err) {
          // FIXME: ?
          cfl_g.removeNode(src);
          console.error("src node:", src);
          console.error(err);
        }
      }

      for (const sink of sinks) {
        const {
          component_max_path_idx,
        } = components_summmary.find(({ component_nodes_set }) =>
          component_nodes_set.has(sink)
        );

        try {
          const srcs = Object.keys(rev_cfl_nodes_2_edges[sink]).map((n) => +n);

          for (const src of srcs) {
            const { cfl_way_id, osm_path_idx } = rev_cfl_nodes_2_edges[sink][
              src
            ];

            if (osm_path_idx !== component_max_path_idx) {
              // console.warn('FOUND SINK DETOUR:', cfl_way_id);
              detours.add(cfl_way_id);
              cfl_g.removeNode(sink);
              progress = true;
            }
          }
        } catch (err) {
          // FIXME: ?
          console.error("sink node:", sink);
          console.error(err);
        }
      }
    }

    const filtered_conflation_map_ways_info = conflation_map_ways_info.filter(
      ({ cfl_way_id }) => !detours.has(cfl_way_id)
    );

    const cmap_ways_by_osm_path_idx = filtered_conflation_map_ways_info.reduce(
      (acc, d) => {
        const { osm_path_idx } = d;
        acc[osm_path_idx] = acc[osm_path_idx] || [];
        acc[osm_path_idx].push(d);
        return acc;
      },
      []
    );

    // NOTE: map skips empty items
    const sorted_cmap_ways_by_path_idx = cmap_ways_by_osm_path_idx.map(
      (cmap_info_arr) => {
        const osm_way_g = new Graph({
          directed: true,
          multigraph: false,
          compound: false,
        });

        const lookup = {};

        for (const { cfl_way_id, v_node, w_node } of cmap_info_arr) {
          const k = `${v_node}-${w_node}`;
          lookup[k] = cfl_way_id;

          osm_way_g.setEdge(v_node, w_node);
        }

        try {
          const toposorted_cmap_ways = [];

          // This will throw if there is a cycle.
          const toposorted_nodes = GraphAlgorithms.topsort(osm_way_g);

          let [v] = toposorted_nodes;
          for (let i = 1; i < toposorted_nodes.length; ++i) {
            const w = toposorted_nodes[i];

            const k = `${v}-${w}`;
            const cfl_way_id = lookup[k];

            if (!cfl_way_id) {
              console.error("lookup failed");
              throw new Error("INVARIANT VIOLATION");
            }

            toposorted_cmap_ways.push(cfl_way_id);

            v = w;
          }

          return toposorted_cmap_ways;
        } catch (err) {
          // OSM Way's CMap ways have a cycle or lookup failed
          return cmap_info_arr.map(({ cfl_way_id }) => cfl_way_id);
        }
      }
    );

    const cfl_path = _.flattenDeep(sorted_cmap_ways_by_path_idx).filter(
      Boolean
    );

    /*
  //  NOTE: This is a heuristic. It does not guarantee correct ordering.
  //        The difficulties are:
  //          1.  Not all ConflationMap nodes are in the OSM Nodes.
  //              Therefore, cannot depend on
  //          2.  OSM ways can self intersect. This causes cycles and breaks graphlib.alg.toposort.
  const cfl_path = filtered_conflation_map_ways_info
    .filter(({ cfl_way_id }) => !detours.has(cfl_way_id))
    .sort((a, b) => {
      const { osm_path_idx: path_idx_a, v_node: v_a, w_node: w_a } = a;
      const { osm_path_idx: path_idx_b, v_node: v_b, w_node: w_b } = b;

      const osm_path_diff = path_idx_a - path_idx_b;

      // Different OSM Ways
      if (osm_path_diff) {
        return osm_path_diff;
      }

      // Same OSM Way
      // FIXME: Replace the below with a call to a function that gets each cmap
      // way's index along the osm way. The function can sort all cmap ways
      // within a osm way, cache the result, then return the sorted order of
      // the two passed cmap way ids.

      // end node of a is start node of b
      if (w_a === v_b) {
        return -1;
      }

      // end node of b is start node of a
      if (v_a === w_b) {
        return 1;
      }

      const { osm: osm_way_id, osm_fwd } = osm_way_w_dirs[path_idx_a];
      const osm_node_ids = osm_node_ids_by_way_id[osm_way_id];

      // NOTE: OSM Ways can self-intersect
      // Consider:
      //    OSM Way NodeIds         : [a, b, c, a, d]
      //    Conflation Ways (v,w)   : (a,b), (b,c), (c,a), (a, d)

      const x_a = osm_fwd ? v_a : w_a;
      const y_a = osm_fwd ? w_a : v_a;

      const x_b = osm_fwd ? v_b : w_b;
      const y_b = osm_fwd ? w_b : v_b;

      const x_idx_a = osm_node_ids.indexOf(x_a);
      const y_idx_a =
        x_idx_a !== -1
          ? osm_node_ids.findIndex(
              (osm_node_id, i) => i > x_idx_a && osm_node_id === y_a,
            )
          : osm_node_ids.indexOf(y_a);

      const x_idx_b = osm_node_ids.indexOf(x_b);
      const y_idx_b =
        x_idx_a !== -1
          ? osm_node_ids.findIndex(
              (osm_node_id, i) => i > x_idx_b && osm_node_id === y_b,
            )
          : osm_node_ids.indexOf(y_b);

      return Math.max(x_idx_a, y_idx_a) - Math.max(x_idx_b, y_idx_b);
    })
    .map(({ cfl_way_id }) => cfl_way_id);
  */

    console.timeEnd(req_name);

    return cfl_path;
  } catch (err) {
    console.error("!".repeat(20));
    console.log(JSON.stringify({ dataRequest }, null, 4));
    console.error(err);
    console.error("!".repeat(20));
    throw err;
  }
}

module.exports = {
  getConflationMapWays,
};
