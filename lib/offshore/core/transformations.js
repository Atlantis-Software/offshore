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
  behavior = behavior || 'default';

  function recursiveParse(obj, parentAttr) {

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

      // Schema must be serialized in first level only
      if (behavior === 'schema') {
        if (hasOwnProperty(self._transformations, property)) {
          obj[self._transformations[property]] = _.clone(obj[property]);
          delete obj[property];
        }
        return;
      }

      // If the property === SELECT check for any transformation keys
      if (_.isArray(obj[property]) && property === 'select') {
        obj[property].forEach(function(selector, index) {
          if (self._transformations[selector]) {
            obj[property][index] = self._transformations[selector];
          }
        });
      }

      // Transform sort column name
      if (property === 'sort') {
        if (_.isObject(obj[property]) && property === 'sort') {
          _.keys(obj[property]).forEach(function(order) {
            if (self._transformations[order]) {
              obj[property][self._transformations[order]] = obj[property][order];
              delete obj[property][order];
            }
          });
        }

        if (_.isObject(obj[property])) {
          _.keys(obj[property]).forEach(function(order) {
            if (['<', '>', '=', '<=', '>='].indexOf(order) >= 0) {
              _.keys(obj).forEach(function(prop) {
                if (self._transformations[prop]) {
                  obj[self._transformations[prop]] = obj[prop];
                  delete obj[prop];
                }
              });
            }
          });
        }
      }

      // Handle Agregate
      if (( ['sum', 'average', 'min', 'max', 'groupBy'].indexOf(property) >= 0 )) {
        if (_.isArray(obj[property])) {
          obj[property].forEach(function(agregate, index) {
            if (self._transformations[agregate]) {
              obj[property][index] = self._transformations[agregate];
            }
          });
        } else {
          obj[property] = [self._transformations[obj[property]]];
        }
      }

      // Detect attribute
      parentAttr = self.attributes[property] || self.attributes[self._transformations[property]] || parentAttr;
      var type = parentAttr ? parentAttr.type || parentAttr : null;

      // Recursively parse `OR` and `AND` criteria objects to transform keys
      if (_.isArray(obj[property]) && (property === 'or' || property === 'and')) return recursiveParse(obj[property], parentAttr);

      // If Nested Object check it's not a json attribute property
      if (type !== 'json' && _.isPlainObject(obj[property])) {

        // check if object key is in the transformations
        if (hasOwnProperty(self._transformations, property)) {
          obj[self._transformations[property]] = _.clone(obj[property]);
          delete obj[property];

          return recursiveParse(obj[self._transformations[property]], parentAttr);
        }

        return recursiveParse(obj[property], parentAttr);
      }

      // Check if property is a transformation key
      if (hasOwnProperty(self._transformations, property)) {
        obj[self._transformations[property]] = obj[property] || null;
        delete obj[property];
        property = self._transformations[property];
      }

      // Cast types
      if (_.isString(obj[property]) && (type === 'date' || type === 'datetime')) {
        obj[property] = new Date(obj[property]);
      }

    });
  }

  // Recursivly parse attributes to handle nested criteria
  recursiveParse(values);

  return values;
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
