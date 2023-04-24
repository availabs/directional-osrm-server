const { join } = require("path");

const { Pool } = require("pg");

const dotenv = require("dotenv");

dotenv.config({ path: join(__dirname, "../../config/postgres.env") });

const db = new Pool({ max: 10 });

module.exports = {
  async getDb() {
    return db;
  },
};
