const _ = require("lodash");

const { main } = require("../src/controllers/routeHandler");

const conflation_map_version = "2022_v0_6_0";

const locations = [
  { lon: -73.70219, lat: 42.62859 },
  { lon: -73.71817, lat: 42.65522 },
  { lon: -73.70975, lat: 42.69471 },
];

const expected_cways = [];

const expected_tmcs = [
  "120+05843",
  "120P05843",
  "120+05844",
  "120P05844",
  "120+05845",
  "120P27748",
  "120P27750",
  "120P27752",
  "120+05939",
  "120P05939",
  "120+05940",
  "120P05940",
];

test.skip("conflation_map_ways: two locations", async () => {
  const origin = _.first(locations);
  const destination = _.last(locations);

  const cways = await main(
    { locations: [origin, destination] },
    conflation_map_version,
    false
  );

  expect(cways).toEqual(expected_cways);
});

test("tmcs: two locations", async () => {
  const origin = _.first(locations);
  const destination = _.last(locations);

  const tmcs = await main(
    { locations: [origin, destination] },
    conflation_map_version,
    true
  );

  expect(tmcs).toEqual(expected_tmcs);
});

test("tmcs: three locations", async () => {
  const tmcs = await main({ locations }, conflation_map_version, true);

  expect(tmcs).toEqual(expected_tmcs);
});
