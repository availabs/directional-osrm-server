const { main } = require("../src/controllers/routeHandler");

const conflation_map_version = "2022_v0_6_0";

const locations = [
  { lon: -73.80345, lat: 42.65029 },
  { lon: -73.79874, lat: 42.65536 },
  { lon: -73.80065, lat: 42.65606 },
  { lon: -73.80577, lat: 42.6552 },
];

// console.log(JSON.stringify(locations));

const expected_cways = [
  2414212,
  1001101,
  102666,
  1905458,
  1620529,
  2912399,
  1399419,
  3630765,
  3630766,
  3630767,
  3266963,
  3266964,
  3065484,
  1260190,
  2591707,
  132695,
  542304,
  1443686,
  2793467,
  4010695,
  3846239,
  1766659,
  791843,
  2453845,
  3755631,
  2478759,
  2202761,
  2202762,
  2038036,
  2102826,
  978013,
  1228375,
  3237109,
];

const expected_tmcs = ["120+24614", "120-24633", "120-24617"];

test("conflation_map_ways: visits waypoints, not shortest to destination", async () => {
  const ways = await main({ locations }, conflation_map_version);

  expect(ways).toEqual(expected_cways);
});

test("tmcs: visits waypoints, not shortest to destination", async () => {
  const tmcs = await main({ locations }, conflation_map_version, true);

  expect(tmcs).toEqual(expected_tmcs);
});
