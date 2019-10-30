const _ = require('lodash');

const { getMatchedNodesForCoordinates } = require('../daos/coordsToNodesDAO');
const node2WaysDAO = require('../daos/node2WaysDAO');

const getWaysForCoordinates = async (req, res, next) => {
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    // console.error(JSON.stringify(body, null, 4));

    const { coordinates } = body;

    console.error(JSON.stringify({ coordinates }, null, 4));

    const nodes = await getMatchedNodesForCoordinates(coordinates);
    const nodes2Ways = await node2WaysDAO.getNodes2Ways(nodes);

    if (!(Array.isArray(nodes) && nodes.length > 0)) {
      res.send({ ways: null });
      return next();
    }

    const routeInfo = nodes.map(nodeId => ({
      nodeId,
      node2Ways: nodes2Ways[nodeId]
    }));

    if (nodes.length === 1) {
      const ways = Object.keys(routeInfo[0].node2Ways);
      res.send({ ways });
      return next();
    }

    const ways = [];
    const waysData = {};
    for (let i = 0; i < routeInfo.length; ++i) {
      if (i) {
        ways.push([]);
      }

      const ways4node = Object.keys(routeInfo[i].node2Ways);

      for (let j = 0; j < ways4node.length; ++j) {
        const way = ways4node[j];

        const idx = routeInfo[i].node2Ways[way].shift();
        if (waysData[way] !== undefined) {
          if (waysData[way] < idx) {
            _.last(ways).push(way);
          }
        }
        waysData[way] = idx;
      }
    }

    const ways2 = ways.reduce((acc, wArr) => {
      if (!_.isEqual(_.last(acc), wArr)) {
        acc.push(wArr);
      }
      return acc;
    }, []);

    const ways3 = ways2.reduce((acc, waysArr) => {
      if (waysArr.length === 1) {
        acc.push(waysArr[0]);
      } else {
        const way = _.sortBy(waysArr, _.toNumber)[0];
        if (way) {
          acc.push();
        }
      }
      return acc;
    }, []);

    res.send({ ways: ways3 });
    return next();
  } catch (err) {
    // console.log(err);
    res.send({ err });
    return next(false);
  }
};

module.exports = {
  getWaysForCoordinates
};
