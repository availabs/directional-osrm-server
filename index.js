/* eslint-disable global-require */

const cluster = require("cluster");

const { join } = require("path");

const restify = require("restify");
const corsMiddleware = require("restify-cors-middleware");

const dotenv = require("dotenv");

dotenv.config({ path: join(__dirname, "./config/postgres.env") });

const NUM_WORKERS = 4;

if (cluster.isMaster) {
  console.log(`Master ${process.pid} is running`);

  // Fork workers.
  for (let i = 0; i < NUM_WORKERS; i++) {
    cluster.fork();
  }

  cluster.on("exit", (worker) => {
    console.log(`worker ${worker.process.pid} died`);
  });
} else {
  const server = restify.createServer({
    name: "directional-osrm-server",
    version: "0.0.1",
  });

  const {
    getRouteWaysForLocations,
  } = require("./src/controllers/routeHandler");

  const cors = corsMiddleware({
    origins: ["*"],
    allowHeaders: ["Authorization"],
    exposeHeaders: ["Authorization"],
  });

  server.pre(cors.preflight);
  server.use(cors.actual);

  server.use(restify.plugins.acceptParser(server.acceptable));
  server.use(restify.plugins.queryParser());
  server.use(restify.plugins.bodyParser());

  server.post("/route", getRouteWaysForLocations);

  server.listen(7182, function cb() {
    console.log("%s listening at %s", server.name, server.url);
  });

  console.log(`Worker ${process.pid} started`);
}
