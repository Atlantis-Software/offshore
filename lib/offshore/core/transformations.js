/**
 * Module dependencies
 */

var _ = require('lodash');
var utils = require('../utils/helpers');
var hasOwnProperty = utils.object.hasOwnProperty;

/**
 * Transformation
 *
 * Allows for a Offshore Collection to have different
 * attributes than what actually exist in an adater's representation.
 *
 * @param {Object} attributes
 * @param {Object} tables
 */

var Transformation = module.exports = function(attributes, tables) {

  // Hold an internal mapping of keys to transform
  this._transformations = {};

  // Initialize
  this.initialize(attributes, tables);

  return this;
};

/**
 * Initial mapping of transformations.
 *
 * @param {Object} attributes
 * @param {Object} tables
 */

Transformation.prototype.initialize = function(attributes, tables) {
  var self = this;
  self.attributes = attributes;

  _.keys(attributes).forEach(function(attr) {

    // Ignore Functions and Strings
    if (_.isFunction(attributes[attr]) || _.isString(attributes[attr])) {
      return;
    }

    // If not an object, ignore
    if (!_.isObject(attributes[attr])) {
      return;
    }

    // Loop through an attribute and check for transformation keys
    _.keys(attributes[attr]).forEach(function(key) {

      // Currently just works with `columnName`, `collection`, `groupKey`
      if (key !== 'columnName') return;

      // Error if value is not a string
      if (!_.isString(attributes[attr][key])) {
        throw new Error('columnName transformation must be a string');
      }

      // Set transformation attr to new key
      if (key === 'columnName') {
        if (attr === attributes[attr][key]) return;
        self._transformations[attr] = attributes[attr][key];
      }

    });
  });
};

/**
 * Transforms a set of attributes into a representation used
 * in an adapter.
 *
 * @param {Object} attributes to transform
 * @return {Object}
 */

Transformation.prototype.serialize = function(attributes, behavior) {
  var self = this;
  var values = _.clone(attributes);
  // Transform criteria
  if (_.isUndefined(behavior) && !_.isUndefined(values.where)) {
    var criteria = values;
    // Transform select
    if (criteria.select && _.isArray(criteria.select)) {
      criteria.select.forEach(function(selector, index) {
        if (self._transformations[selector]) {
          criteria.select[index] = self._transformations[selector];
        }
      });
    }

    // Transform sort column name
    if (criteria.sort && _.isObject(criteria.sort)) {
      _.keys(criteria.sort).forEach(function(order) {
        if (self._transformations[order]) {
          criteria.sort[self._transformations[order]] = criteria.sort[order];
          delete criteria.sort[order];
        }
      });
    }

    // Transform sum
    if (criteria.sum && _.isArray(criteria.sum)) {
      criteria.sum.forEach(function(sum, index) {
        if (self._transformations[sum]) {
          criteria.sum[index] = self._transformations[sum];
        }
      });
    }

    // Transform average
    if (criteria.average && _.isArray(criteria.average)) {
      criteria.average.forEach(function(average, index) {
        if (self._transformations[average]) {
          criteria.average[index] = self._transformations[average];
        }
      });
    }

    // Transform min
    if (criteria.min && _.isArray(criteria.min)) {
      criteria.min.forEach(function(min, index) {
        if (self._transformations[min]) {
          criteria.min[index] = self._transformations[min];
        }
      });
    }

    // Transform max
    if (criteria.max && _.isArray(criteria.max)) {
      criteria.max.forEach(function(max, index) {
        if (self._transformations[max]) {
          criteria.max[index] = self._transformations[max];
        }
      });
    }

    // Transform groupBy
    if (criteria.groupBy && _.isArray(criteria.groupBy)) {
      criteria.groupBy.forEach(function(groupBy, index) {
        if (self._transformations[groupBy]) {
          criteria.groupBy[index] = self._transformations[groupBy];
        }
      });
    }
    if (criteria.where) {
      recursiveSerialize(criteria.where);
    }
    return criteria;
  }

  // Schema must be serialized in first level only
  if (behavior === 'schema') {
    var schema = values;
    _.keys(schema).forEach(function(property) {
      if (hasOwnProperty(self._transformations, property)) {
        schema[self._transformations[property]] = schema[property];
        delete schema[property];
      }
    });
    return schema;
  }

  // Recursivly serialize attributes to handle nested criteria
  recursiveSerialize(values);
  return values;

  function recursiveSerialize(obj, parentAttr) {

    // Return if no object
    if (!obj) return;

    // Handle array of types for findOrCreateEach
    if (_.isString(obj)) {
      if (hasOwnProperty(self._transformations, obj)) {
        values = self._transformations[obj];
        return;
      }
      return;
    }

    _.keys(obj).forEach(function(property) {

      // Just a double check to exit if hasOwnProperty fails
      if (!hasOwnProperty(obj, property)) return;

      // Detect attribute
      parentAttr = self.attributes[property] || self.attributes[self._transformations[property]] || parentAttr;
      var type = parentAttr ? parentAttr.type || parentAttr : null;

      // Recursively serialize `OR` and `AND` criteria objects to transform keys
      if (_.isArray(obj[property]) && (property === 'or' || property === 'and')) return recursiveSerialize(obj[property], parentAttr);

      // If Nested Object check it's not a json attribute property
      if (type && type.toLowerCase() !== 'json' && _.isPlainObject(obj[property])) {

        // check if object key is in the transformations
        if (hasOwnProperty(self._transformations, property)) {
          obj[self._transformations[property]] = _.clone(obj[property]);
          delete obj[property];

          return recursiveSerialize(obj[self._transformations[property]], parentAttr);
        }

        return recursiveSerialize(obj[property], parentAttr);
      }

      // Check if property is a transformation key
      if (hasOwnProperty(self._transformations, property)) {
        var value = obj[property];
        delete obj[property];
        obj[self._transformations[property]] = value;
        property = self._transformations[property];
      }

      // Cast types
      if (_.isString(obj[property]) && (type === 'date' || type === 'datetime')) {
        obj[property] = new Date(obj[property]);
      }
    });
  }
};

/**
 * Transforms a set of attributes received from an adapter
 * into a representation used in a collection.
 *
 * @param {Object} attributes to transform
 * @return {Object}
 */

Transformation.prototype.unserialize = function(attributes) {
  var self = this;
  var values = _.clone(attributes);

  // Loop through the attributes and change them
  _.keys(this._transformations).forEach(function(key) {
    var transformed = self._transformations[key];

    if (!hasOwnProperty(attributes, transformed)) return;

    values[key] = attributes[transformed];
    if (transformed !== key) delete values[transformed];
  });

  return values;
};
