/**
 * Module dependencies
 */

var _ = require('lodash');
var async = require('async');
var hasOwnProperty = require('../../../utils/helpers').object.hasOwnProperty;


/**
 * Try and synchronize the underlying physical-layer schema
 * in safely manner by only adding new collections and new attributes
 * to work with our app's collections. (i.e. models)
 *
 * @param  {Function} cb
 */
module.exports = function(cb) {
  var self = this;


  // Check that collection exists
  self.describe(function afterDescribe(err, attrs) {

    if (err) return cb(err);

    // if it doesn't go ahead and add it and get out
    if (!attrs) return self.define(cb);


    var query = self._query || {};
    var connName = self.connection;
    // check default connection
    if (connName === 'default' && query.defaultConnection) {
      connName = query.defaultConnection;
    }
    var connection = self.query.offshore.connections[connName];
    // check connection
    if (!connection) {
      return cb(new Error('No valid connection specified'));
    }
    var adapter = connection._adapter;

    // Check if an addAttribute adapter method is defined
    if (!hasOwnProperty(adapter, 'addAttribute')) {
      return cb();
    }

    // The collection we're working with
    var collectionID = self.collection;

    // Remove hasMany association keys before sending down to adapter
    var schema = _.clone(self.query._schema.schema) || {};
    Object.keys(schema).forEach(function(key) {
      if (schema[key].type) return;
      delete schema[key];
    });

    // Iterate through each attribute in the new definition
    // Used for keeping track of previously undefined attributes
    // when updating the data stored at the physical layer.
    var newAttributes = _.reduce(schema, function checkAttribute(newAttributes, attribute, attrName) {
      if (!attrs[attrName]) {
        newAttributes[attrName] = attribute;
      }
      return newAttributes;
    }, {});

    // Add new attributes
    async.eachSeries(_.keys(newAttributes), function(attrName, next) {
      var attrDef = newAttributes[attrName];
      adapter.addAttribute(connName, collectionID, attrName, attrDef, next);
    }, cb);

  });
};
