const restify = require('restify');

const server = restify.createServer({
  name: 'directional-osrm-server',
  version: '0.0.1'
});

const { getRouteWaysForLocations } = require('./src/controllers/routeHandler');

server.use(restify.plugins.acceptParser(server.acceptable));
// server.use(restify.plugins.queryParser());
server.use(restify.plugins.bodyParser());

server.post('/route', getRouteWaysForLocations);

server.listen(7182, function cb() {
  console.log('%s listening at %s', server.name, server.url);
});
