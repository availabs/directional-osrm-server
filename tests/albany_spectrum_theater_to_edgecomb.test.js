const _ = require("lodash");

const { main } = require("../src/controllers/routeHandler");

const conflation_map_version = "2022_v0_6_0";

const locations = [
  { lon: -73.7768, lat: 42.64322 },
  // { lon: -73.78021, lat: 42.6417 },
  // { lon: -73.78947, lat: 42.64218 },
  { lon: -73.79146, lat: 42.64318 },
];

const expected_cways = [
  3476729,
  1949401,
  1080504,
  1431702,
  4044624,
  154804,
  1875542,
  3259697,
  3259093,
  2490467,
  2994726,
  249486,
  798032,
  2898853,
  1852468,
  3188250,
  801243,
  801244,
  801245,
  1159788,
  551188,
  551189,
  1653368,
  2392834,
  1625641,
  3166144,
  3899824,
  1992667,
  3592778,
  1030343,
  1030344,
  3852732,
  2777990,
  2222229,
  1470478,
  4071597,
  2930059,
  2930060,
];

const expected_tmcs = ["120-11205", "120N31419", "120-31418", "120-31417"];

test("two locations, cways", async () => {
  const ways = await main({ locations }, conflation_map_version, false);

  const intxn = _.intersection(ways, expected_cways);

  // result covers expected
  expect(intxn).toEqual(expected_cways);

  expect(ways).toEqual(expected_cways);
});

test("two locations, tmcs", async () => {
  const tmcs = await main({ locations }, conflation_map_version, true);

  expect(tmcs).toEqual(expected_tmcs);
});
