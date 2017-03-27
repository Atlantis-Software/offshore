/**
 * Base Adapter Definition
 */

var _ = require('lodash');

var Adapter = module.exports = function(options) {
  this.connection = _.keys(options.connections || {})[0] || 'default';

  // Set a Query instance to get access to top
  // level query functions
  this.query = options.query || {};

  // Set Collection Name
  this.collection = options.collection || '';

  // Set Model Identity
  this.identity = options.identity || '';

  return this;
};

Adapter.prototype._loadQuery = function(query) {
  if (!query) {
    return this;
  }
  var obj = Object.create(this);
  obj._query = query;
  return obj;
};

_.extend(
  Adapter.prototype,
  require('./dql'),
  require('./ddl'),
  require('./compoundQueries'),
  require('./aggregateQueries'),
  require('./setupTeardown'),
  require('./sync'),
  require('./stream')
);
