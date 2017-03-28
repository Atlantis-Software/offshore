/**
 * Module Dependencies
 */

var hasOwnProperty = require('../utils/helpers').object.hasOwnProperty;

/**
 * Collection Loader
 *
 * @param {Object} connections
 * @param {Object} collection
 * @api public
 */

var CollectionLoader = module.exports = function(collection, connections, defaults) {

  this.defaults = defaults;

  // Normalize and validate the collection
  this.collection = this._validate(collection, connections);
  return this;
};

/**
 * Initalize the collection
 *
 * @param {Object} context
 * @param {Function} callback
 * @api public
 */

CollectionLoader.prototype.initialize = function initialize(context) {
  return new this.collection(context, this.connections);
};

/**
 * Validate Collection structure.
 *
 * @param {Object} collection
 * @param {Object} connections
 * @api private
 */

CollectionLoader.prototype._validate = function _validate(collection, connections) {

  // Throw Error if no Tablename/Identity is set
  if (!hasOwnProperty(collection.prototype, 'tableName') && !hasOwnProperty(collection.prototype, 'identity')) {
    throw new Error('A tableName or identity property must be set.');
  }

  // Ensure identity is lowercased
  collection.prototype.identity = collection.prototype.identity.toLowerCase();

  // Set the defaults
  collection.prototype.defaults = this.defaults;

  // Find the connections used by this collection
  // If none is specified check if a default connection exist
  if (!hasOwnProperty(collection.prototype, 'connection')) {
    // Set the connection as the default
    collection.prototype.connection = 'default';
    return collection;
  }

  // use first connection in queries
  if (Array.isArray(collection.prototype.connection)) {
    collection.prototype.connection = collection.prototype.connection[0];
  }

  // Ensure the named connection exist
  if (collection.prototype.connection !== 'default' && !hasOwnProperty(connections, collection.prototype.connection)) {
    var msg = 'The connection ' + collection.prototype.connection + ' specified in ' + collection.prototype.identity + ' does not exist!';
    throw new Error(msg);
  }

  this.connections = connections;

  return collection;
};
