const OSRMService = require('../services/OSRMService')

module.exports = {
  getRouteNodesForLocations: OSRMService.getRouteNodesForLocations,
  getMatchedNodesForCoordinates: OSRMService.getMatchedNodesForCoordinates
};
