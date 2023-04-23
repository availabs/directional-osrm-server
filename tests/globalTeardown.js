const { getDb } = require("../src/services/Database");

module.exports = async function teardown() {
  const db = await getDb();

  await db.end();
};
