/**
 * Compound Queries Adapter Normalization
 */

var _ = require('lodash');
var normalize = require('../utils/normalize');
var hasOwnProperty = require('../utils/helpers').object.hasOwnProperty;

module.exports = {

  findOrCreate: function(criteria, values, cb, metaContainer) {
    var self = this;
    var connName,
        adapter;

    // If no values were specified, use criteria
    if (!values) values = criteria.where ? criteria.where : criteria;

    // Normalize Arguments
    criteria = normalize.criteria(criteria);
    cb = normalize.callback(cb);

    // Build Default Error Message
    var err = 'No find() or create() method defined in adapter!';

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

    // Custom user adapter behavior
    if (hasOwnProperty(adapter, 'findOrCreate')) {
      return adapter.findOrCreate(connName, this.collection, values, cb, metaContainer);
    }

    // Default behavior
    // WARNING: Not transactional!  (unless your data adapter is)
    this.findOne(criteria, function(err, result) {
      if (err) return cb(err);
      if (result) return cb(null, result[0]);

      self.create(values, cb, metaContainer);
    }, metaContainer);
  }

};
