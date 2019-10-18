const locationsToNodesDAO = require('../daos/locationsToNodesDAO');
const node2WaysDAO = require('../daos/node2WaysDAO');

const getRouteWaysForLocations = async (req, res, next) => {
  const { locations } = req.body;

  const nodes = await locationsToNodesDAO.getRouteNodesForLocations(locations);
  const nodes2Ways = await node2WaysDAO.getNodes2Ways(nodes);

  const routeInfo = nodes.map(nodeId => ({
    nodeId,
    node2ways: nodes2Ways[nodeId]
  }));

  // res.send({ nodes, nodes2Ways, routeInfo });
  res.send({ routeInfo });
  next();
};

module.exports = {
  getRouteWaysForLocations
};
