const _ = require('lodash');

const { getMatchedNodesForCoordinates } = require('../services/OSRMService');
const NodesToWaysService = require('../services/Nodes2WaysService');

const getWaysForCoordinates = async (req, res, next) => {
  try {
    const dataRequest =
      typeof req.body === 'string' ? JSON.parse(req.body) : req.body;

    const { nodes, confidences } = await getMatchedNodesForCoordinates(
      dataRequest,
    );

    const confidence = Math.min(...confidences);

    const nodes2Ways = await NodesToWaysService.getNodes2Ways(nodes);

    if (!(Array.isArray(nodes) && nodes.length > 0)) {
      res.send({ ways: null });
      return next();
    }

    const routeInfo = nodes.map(nodeId => ({
      nodeId,
      node2Ways: nodes2Ways[nodeId],
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

    res.send({ ways: ways3, confidence });
    return next();
  } catch (err) {
    console.log(err);
    res.send({ err });
    return next(false);
  }
};

module.exports = {
  getWaysForCoordinates,
};
