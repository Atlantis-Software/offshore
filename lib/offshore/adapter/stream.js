/**
 * Module Dependencies
 */

var normalize = require('../utils/normalize');
var hasOwnProperty = require('../utils/helpers').object.hasOwnProperty;

/**
 * Stream Normalization
 */

module.exports = {

  // stream.write() is used to send data
  // Must call stream.end() to complete stream
  stream: function(criteria, stream, metaContainer) {

    // Normalize Arguments
    criteria = normalize.criteria(criteria);

    // Build Default Error Message
    var err = 'No stream() method defined in adapter!';

    var query = this._query || {};
    var connName = this.connection;
    // check default connection
    if (connName === 'default' && query.defaultConnection) {
      connName = query.defaultConnection;
    }
    var connection = this.query.offshore.connections[connName];
    // check connection
    if (!connection) {
      return cb(new Error('No valid connection specified'));
    }
    var adapter = connection._adapter;
    // check transaction
    if (query.transaction && query.transaction[connName]) {
      connName = query.transaction[connName];
    }

    if (!hasOwnProperty(adapter, 'stream')) return stream.end(new Error(err));
    adapter.stream(connName, this.collection, criteria, stream, metaContainer);
  }

};
