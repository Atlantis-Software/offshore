/**
 * Module Dependencies
 */

var async = require('async');
var _ = require('lodash');
var utils = require('../../utils/helpers');
var Deferred = require('../deferred');
var callbacks = require('../../utils/callbacksRunner');
var nestedOperations = require('../../utils/nestedOperations');
var hop = utils.object.hasOwnProperty;


/**
 * Create a new record
 *
 * @param {Object || Array} values for single model or array of multiple values
 * @param {Function} callback
 * @return Deferred object if no callback
 */

module.exports = function(values, cb, metaContainer) {

  var self = this;

  // Handle Deferred where it passes criteria first
  if(_.isPlainObject(arguments[0]) && (_.isPlainObject(arguments[1]) || _.isArray(arguments[1]))) {
    values = arguments[1];
    cb = arguments[2];
  }

  // Remove all undefined values
  if (_.isArray(values)) {
    values = _.filter(values, undefined);
  }

  // Return Deferred or pass to adapter
  if (typeof cb !== 'function') {
    return new Deferred(this, this.create, {}, values);
  }

  // Handle Array of values
  if (Array.isArray(values)) {
    return this.createEach(values, cb, metaContainer);
  }

  // Process Values
  var valuesObject = processValues.call(this, values);

  // Create any of the belongsTo associations and set the foreign key values
  createBelongsTo.call(this, valuesObject, function(err) {
    if (err) return cb(err);

    beforeCallbacks.call(self, valuesObject, function(err) {
      if (err) return cb(err);
      createValues.call(self, valuesObject, cb, metaContainer);
    }, metaContainer);
  });
};


/**
 * Process Values
 *
 * @param {Object} values
 * @return {Object}
 */

function processValues(values) {

  // Set Default Values if available
  for (var key in this.attributes) {
    if ((!hop(values, key) || values[key] === undefined) && hop(this.attributes[key], 'defaultsTo')) {
      var defaultsTo = this.attributes[key].defaultsTo;
      if (typeof defaultsTo === 'function') {
        values[key] = defaultsTo.call(values);
      } else {
        values[key] = _.cloneWith(defaultsTo, function dealWithBuffers(val, key) {
          if (val instanceof Buffer) {
            return val;
          }
        });
      }
    }
  }

  // Pull out any associations in the values
  var associations = nestedOperations.valuesParser.call(this, this.identity, this.offshore.schema, values);
  // Replace associated models with their foreign key values if available.
  // Unless the association has a custom primary key (we want to create the object)
  values = nestedOperations.reduceAssociations.call(this, this.identity, this.offshore.schema, values, 'create');
  // Cast values to proper types (handle numbers as strings)
  values = this._cast.run(values);

  return { values: values, associations: associations };
}

/**
 * Create BelongsTo Records
 *
 */

function createBelongsTo(valuesObject, cb, metaContainer) {
  var self = this;

  async.each(_.keys(valuesObject.associations.models), function(item, next) {

    // Check if value is an object. If not don't try and create it.
    if (!_.isPlainObject(valuesObject.associations.models[item])) return next();

    // Check for any transformations
    var attrName = hop(self._transformer._transformations, item) ? self._transformer._transformations[item] : item;

    var attribute = self._schema.schema[attrName];
    var modelName;

    if (hop(attribute, 'collection')) modelName = attribute.collection;
    if (hop(attribute, 'model')) modelName = attribute.model;
    if (!modelName) return next();

    var model = self.offshore.collections[modelName]._loadQuery(self._query);
    var pkValue = valuesObject.associations.models[item][model.primaryKey];

    var criteria = {};
    criteria[model.primaryKey] = pkValue;

    // If a pkValue if found, do a findOrCreate and look for a record matching the pk.
    var query;

    if (pkValue) {
      query = model.findOrCreate(criteria, valuesObject.associations.models[item]);
    } else {
      query = model.create(valuesObject.associations.models[item]);
    }

    if(metaContainer) {
      query.meta(metaContainer);
    }

    query.exec(function(err, val) {
      if (err) return next(err);

      // attach the new model's pk value to the original value's key
      var pk = val[model.primaryKey];
      valuesObject.values[item][model.primaryKey] = pk;
      valuesObject.associations.models[item][model.primaryKey] = pk;
      next();
    });

  }, cb);
}

/**
 * Run Before* Lifecycle Callbacks
 *
 * @param {Object} valuesObject
 * @param {Function} cb
 */

function beforeCallbacks(valuesObject, cb) {
  var self = this;

  async.series([

    // Run Validation with Validation LifeCycle Callbacks
    function(cb) {
      callbacks.validate(self, valuesObject.values, false, cb);
    },

    // Before Create Lifecycle Callback
    function(cb) {
      callbacks.beforeCreate(self, valuesObject.values, cb);
    }

  ], cb);

}

/**
 * Create Parent Record and any associated values
 *
 * @param {Object} valuesObject
 * @param {Function} cb
 */

function createValues(valuesObject, cb, metaContainer) {
  var self = this;
  var date;
  var values = _.clone(valuesObject.values);
  var parentSchema = self.offshore.schema[self.identity];

  _.forEach(parentSchema.attributes, function(attribute, attributeKey) {
    if(attribute.foreignKey && values[attributeKey] && _.isObject(values[attributeKey])) {
      var deepChildSchema = self.offshore.schema[attribute.references];
      var deepChildPk = _.findKey(deepChildSchema.attributes, { primaryKey: true });
      values[attributeKey] = values[attributeKey][deepChildPk];
    }
  });

  // Automatically add updatedAt and createdAt (if enabled)
  if (self.autoCreatedAt) {
    if (!values[self.autoCreatedAt]) {
      date = date || new Date();
      values[self.autoCreatedAt] = date;
    }
  }

  if (self.autoUpdatedAt) {
    if (!values[self.autoUpdatedAt]) {
      date = date || new Date();
      values[self.autoUpdatedAt] = date;
    }
  }

  // Transform Values
  values = self._transformer.serialize(values);
  // Clean attributes
  values = self._schema.cleanValues(values);

  // Pass to adapter here
  self.adapter._loadQuery(self._query).create(values, function(err, values) {
    if (err) {
      if (typeof err === 'object') { err.model = self._model.globalId; }
      return cb(err);
    }

    // Unserialize values
    values = self._transformer.unserialize(values);
    // If no associations were used, run after
    if (_.keys(valuesObject.associations.collections).length === 0) {
      // Replace child by foreign key
      _.forEach(valuesObject.associations.models, function(value, key) {
        values[key] = value;
      });
      return after(values);
    }

    var parentModel = new self._model(values)._loadQuery(self._query);
    nestedOperations.create.call(self, parentModel, valuesObject.associations.collections, function(err, values) {
      if (err) {
        return cb(err);
      }
      after(values, {showJoins: true});
    });

    function after(values, mixins) {
      mixins = mixins || {};

      // Run After Create Callbacks
      callbacks.afterCreate(self, values, function(err) {
        if (err) return cb(err);
        // Return an instance of Model
        var model = new self._model(values, mixins)._loadQuery(self._query);

        cb(null, model);
      });
    }

  }, metaContainer);
}
