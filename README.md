# directional-osrm-server

This server routes over the AVAIL conflation map.

It it hands makes calls to OSRM to get the OSM route,
then makes database calls to crosswalk the OSM Ways
with the ConflationMap Ways.

## Running

### Configuration

#### OSRM Routering Servers

This repository's server depends on OSRM Routing servers. See
[availabs/osrm_experiments](https://github.com/availabs/osrm_experiments). The
`./config/osrm_routing_servers.js` file tells this server how to connect to
each ConflationMap's respective OSRM server.

```sh
$ cp ./config/osrm_routing_servers.js.template ./config/osrm_routing_servers.js
```

Edit the config so the ConflationMap versions so they point to the respective
OSRM servers. For example,

```js
module.exports = {
  '2016_v0_6_0': 'http://localhost:5016',
  '2017_v0_6_0': 'http://localhost:5017',
  '2018_v0_6_0': 'http://localhost:5018',
  '2019_v0_6_0': 'http://localhost:5019',
  '2020_v0_6_0': 'http://localhost:5020',
  '2021_v0_6_0': 'http://localhost:5021',
  '2022_v0_6_0': 'http://localhost:5022',
};
```

#### PostgreSQL Database

```sh
$ cp ./config/postgres.env.template ./confif/postgres.env
```

Edit the configuration.

## Starting the server

```sh
$ npm start
```
