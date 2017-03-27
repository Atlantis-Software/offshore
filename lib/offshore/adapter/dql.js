/**
 * Module Dependencies
 */

var normalize = require('../utils/normalize');
var schema = require('../utils/schema');
var hasOwnProperty = require('../utils/helpers').object.hasOwnProperty;
var _ = require('lodash');


/**
 * DQL Adapter Normalization
 */
module.exports = {

  hasJoin: function() {
    var connName = this.dictionary.join;
    if (!connName && (this._query && this._query.defaultConnection)) {
      connName = this._query.defaultConnection;
    }
    if (!connName) {
      return false;
    }
    var adapter = this.query.offshore.connections[connName]._adapter;
    return hasOwnProperty(adapter, 'join');
  },


  /**
   * join()
   *
   * If `join` is defined in the adapter, Offshore will use it to optimize
   * the `.populate()` implementation when joining collections within the same
   * database connection.
   *
   * @param  {[type]}   criteria
   * @param  {Function} cb
   */
  join: function(criteria, cb, metaContainer) {

    // Normalize Arguments
    criteria = normalize.criteria(criteria);
    cb = normalize.callback(cb);

    // Build Default Error Message
    var err = 'No join() method defined in adapter!';

    var connName = this.dictionary.join;
    if (!connName) {
      if (this._query && this._query.defaultConnection) {
        connName = this._query.defaultConnection;
      } else {
        return cb(new Error(err));
      }
    }

    var adapter = this.query.offshore.connections[connName]._adapter;
    if (this._query && this._query.transaction && this._query.transaction[connName]) {
      connName = this._query.transaction[connName];
    }

    if (!hasOwnProperty(adapter, 'join')) return cb(new Error(err));

    // Parse Join Criteria and set references to any collection tableName properties.
    // This is done here so that everywhere else in the codebase can use the collection identity.
    criteria = schema.serializeJoins(criteria, this.query.offshore.schema);

    adapter.join(connName, this.collection, criteria, cb, metaContainer);
  },


  /**
   * create()
   *
   * Create one or more models.
   *
   * @param  {[type]}   values [description]
   * @param  {Function} cb     [description]
   * @return {[type]}          [description]
   */
  create: function(values, cb, metaContainer) {
    var globalId = this.query.globalId;

    // Normalize Arguments
    cb = normalize.callback(cb);

    if (Array.isArray(values)) {
      return this.createEach.call(this, values, cb, metaContainer);
    }

    // Build Default Error Message
    var err = 'No create() method defined in adapter!';

    var connName = this.dictionary.create;
    if (!connName) {
      if (this._query && this._query.defaultConnection) {
        connName = this._query.defaultConnection;
      } else {
        return cb(new Error(err));
      }
    }

    var adapter = this.query.offshore.connections[connName]._adapter;
    if (this._query && this._query.transaction && this._query.transaction[connName]) {
      connName = this._query.transaction[connName];
    }

    if (!hasOwnProperty(adapter, 'create')) return cb(new Error(err));
    adapter.create(connName, this.collection, values, normalize.callback(function afterwards(err, createdRecord) {
      if (err) {
        if (typeof err === 'object') err.model = globalId;
        return cb(err);
      }
      else return cb(null, createdRecord);
    }), metaContainer);
  },

  /**
   * find()
   *
   * Find a set of models.
   *
   * @param  {[type]}   criteria [description]
   * @param  {Function} cb       [description]
   * @return {[type]}            [description]
   */
  find: function(criteria, cb, metaContainer) {

    // Normalize Arguments
    criteria = normalize.criteria(criteria);
    cb = normalize.callback(cb);

    // Build Default Error Message
    var err = 'No find() method defined in adapter!';

    var connName = this.dictionary.find;
    if (!connName) {
      if (this._query && this._query.defaultConnection) {
        connName = this._query.defaultConnection;
      } else {
        return cb(new Error(err));
      }
    }

    var adapter = this.query.offshore.connections[connName]._adapter;
    if (this._query && this._query.transaction && this._query.transaction[connName]) {
      connName = this._query.transaction[connName];
    }

    if (!adapter.find) return cb(new Error(err));
    adapter.find(connName, this.collection, criteria, cb, metaContainer);
  },

  /**
   * findOne()
   *
   * Find exactly one model.
   *
   * @param  {[type]}   criteria [description]
   * @param  {Function} cb       [description]
   * @return {[type]}            [description]
   */
  findOne: function(criteria, cb, metaContainer) {

    // make shallow copy of criteria so original does not get modified
    criteria = _.clone(criteria);

    // Normalize Arguments
    cb = normalize.callback(cb);

    // Build Default Error Message
    var err = '.findOne() requires a criteria. If you want the first record try .find().limit(1)';

    // If no criteria is specified or where is empty return an error
    if (!criteria || criteria.where === null) return cb(new Error(err));

    var connName = this.dictionary.findOne;
    if (!connName && (this._query && this._query.defaultConnection)) {
      connName = this._query.defaultConnection;
    }

    if (connName) {
      var adapter = this.query.offshore.connections[connName]._adapter;
      // Detects if there is a `findOne` in the adapter. Use it if it exists.
      if (hasOwnProperty(adapter, 'findOne')) {
        if (this._query && this._query.transaction && this._query.transaction[connName]) {
          connName = this._query.transaction[connName];
        }

        if (adapter.findOne) {
          // Normalize Arguments
          criteria = normalize.criteria(criteria);
          return adapter.findOne(connName, this.collection, criteria, cb, metaContainer);
        }
      }
    }

    // Fallback to use `find()` to simulate a `findOne()`
    // Enforce limit to 1
    criteria.limit = 1;

    this.find(criteria, function(err, models) {
      if (!models) return cb(err);
      if (models.length < 1) return cb(err);

      cb(null, models);
    }, metaContainer);
  },

  /**
   * [count description]
   * @param  {[type]}   criteria [description]
   * @param  {Function} cb       [description]
   * @return {[type]}            [description]
   */
  count: function(criteria, cb, metaContainer) {


    // Normalize Arguments
    cb = normalize.callback(cb);
    criteria = normalize.criteria(criteria);

    // Build Default Error Message
    var err = '.count() requires the adapter define either a count method or a find method';


    var connName = this.dictionary.count || this.dictionary.find;
    if (!connName && (this._query && this._query.defaultConnection)) {
      connName = this._query.defaultConnection;
    }
    if (!connName) {
      return cb(new Error(err));
    }

    var adapter = this.query.offshore.connections[connName]._adapter;
    if (this._query && this._query.transaction && this._query.transaction[connName]) {
      connName = this._query.transaction[connName];
    }

    if (hasOwnProperty(adapter, 'count')) return adapter.count(connName, this.collection, criteria, cb, metaContainer);

    this.find(criteria, function(err, models) {
      if (err) return cb(err);
      var count = models && models.length || 0;
      cb(err, count);
    }, metaContainer);
  },


  /**
   * [update description]
   * @param  {[type]}   criteria [description]
   * @param  {[type]}   values   [description]
   * @param  {Function} cb       [description]
   * @return {[type]}            [description]
   */
  update: function(criteria, values, cb, metaContainer) {
    var globalId = this.query.globalId;

    // Normalize Arguments
    cb = normalize.callback(cb);
    criteria = normalize.criteria(criteria);

    if (criteria === false) {
      return cb(null, []);
    } else if (!criteria) {
      return cb(new Error('No criteria or id specified!'));
    }

    // Build Default Error Message
    var err = 'No update() method defined in adapter!';

    var connName = this.dictionary.update;
    if (!connName && (this._query && this._query.defaultConnection)) {
      connName = this._query.defaultConnection;
    }
    if (!connName) {
      return cb(new Error(err));
    }

    var adapter = this.query.offshore.connections[connName]._adapter;
    if (this._query && this._query.transaction && this._query.transaction[connName]) {
      connName = this._query.transaction[connName];
    }

    if (!hasOwnProperty(adapter, 'update')) return cb(new Error(err));

    adapter.update(connName, this.collection, criteria, values, normalize.callback(function afterwards(err, updatedRecords) {
      if (err) {
        if (typeof err === 'object') err.model = globalId;
        return cb(err);
      }
      return cb(null, updatedRecords);
    }), metaContainer);
  },


  /**
   * [destroy description]
   * @param  {[type]}   criteria [description]
   * @param  {Function} cb       [description]
   * @return {[type]}            [description]
   */
  destroy: function(criteria, cb, metaContainer) {

    // Normalize Arguments
    cb = normalize.callback(cb);
    criteria = normalize.criteria(criteria);

    // Build Default Error Message
    var err = 'No destroy() method defined in adapter!';

    var connName = this.dictionary.destroy;
    if (!connName && (this._query && this._query.defaultConnection)) {
      connName = this._query.defaultConnection;
    }
    if (!connName) {
      return cb(new Error(err));
    }
    var adapter = this.query.offshore.connections[connName]._adapter;
    if (!hasOwnProperty(adapter, 'destroy')) {
      return cb(new Error(err));
    }

    if (this._query && this._query.transaction && this._query.transaction[connName]) {
      connName = this._query.transaction[connName];
    }

    adapter.destroy(connName, this.collection, criteria, cb, metaContainer);
  }

};
