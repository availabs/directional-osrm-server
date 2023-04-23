const { inspect } = require("util");

const _ = require("lodash");

const OSRMService = require("../services/OSRMService");
const NodesToWaysService = require("../services/OsmNodes2OsmWaysService");

const logger = require("../logger");

const main = async (dataRequest, conflation_map_version, return_tmcs) => {
  const osrm_result = await OSRMService.getRouteNodesForLocations(
    conflation_map_version,
    dataRequest
  );

  logger.debug(dataRequest);

  if (
    !(
      osrm_result &&
      Array.isArray(osrm_result.nodes) &&
      osrm_result.nodes.length > 0
    )
  ) {
    return null;
  }

  const ways = await NodesToWaysService.getConflationMapWays(
    conflation_map_version,
    osrm_result,
    dataRequest,
    return_tmcs
  );

  logger.trace(ways);

  return ways;
};

const getRouteWaysForLocations = async (req, res, next) => {
  try {
    const {
      query: { conflation_map_version, return_tmcs },
    } = req;

    // eslint-disable-next-line no-underscore-dangle
    const _return_tmcs = /^(1|true|t|y|yes)$/.test(return_tmcs);

    const dataRequest =
      typeof req.body === "string" ? JSON.parse(req.body) : req.body;

    const ways = await main(dataRequest, conflation_map_version, _return_tmcs);

    await res.send({ ways });

    return next();
  } catch (err) {
    logger.error(err.message);
    logger.error(err.stack);
    res.send({ err });
    return next(false);
  }
};

module.exports = {
  main,
  getRouteWaysForLocations,
};
