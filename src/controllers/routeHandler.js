const _ = require('lodash');

const OSRMService = require('../services/OSRMService');
const NodesToWaysService = require('../services/OsmNodes2OsmWaysService');

const getRouteWaysForLocations = async (req, res, next) => {
  try {
    const {
      query: { conflation_map_version },
    } = req;

    const dataRequest =
      typeof req.body === 'string' ? JSON.parse(req.body) : req.body;

    const osrm_result = await OSRMService.getRouteNodesForLocations(
      conflation_map_version,
      dataRequest,
    );

    if (
      !(
        osrm_result &&
        Array.isArray(osrm_result.nodes) &&
        osrm_result.nodes.length > 0
      )
    ) {
      res.send({ ways: null });
      return next();
    }

    const ways = await NodesToWaysService.getConflationMapWays(
      conflation_map_version,
      osrm_result,
    );

    res.send({ ways });
    return next();
  } catch (err) {
    console.log(err);
    res.send({ err });
    return next(false);
  }
};

module.exports = {
  getRouteWaysForLocations,
};
