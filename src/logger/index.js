const pino = require("pino");
const pretty = require("pino-pretty");

const level = process.env.AVAIL_LOGGING_LEVEL || "info";

const logger = pino(
  {
    level,
  },
  pretty({
    // https://github.com/pinojs/pino-pretty#usage-with-jest
    // sync: process.env.NODE_ENV === "test",
    sync: true,
    minimumLevel: "trace",
  })
);

module.exports = logger;
