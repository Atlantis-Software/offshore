/**
 * Handles validation on a model
 *
 * Uses Offshore-validator for validating
 * https://github.com/Atlantis-Software/offshore-validator
 */

var _ = require('lodash');
var validator = require('offshore-validator');
var async = require('async');
var utils = require('../utils/helpers');
var hasOwnProperty = utils.object.hasOwnProperty;
var WLValidationError = require('../error/WLValidationError');

var offshoreCriteria = require('offshore-criteria');
var ChildValidator = require('./childValidations');

/**
 * Build up validations using the Offshore-validator module.
 *
 * @param {String} adapter
 */

var Validator = module.exports = function(context) {
  this.validations = {};
  this.context = context;
};

/**
 * Builds a Validation Object from a normalized attributes
 * object.
 *
 * Loops through an attributes object to build a validation object
 * containing attribute name as key and a series of validations that
 * are run on each model. Skips over type and defaultsTo as they are
 * schema properties.
 *
 * Example:
 *
 * attributes: {
 *   name: {
 *     type: 'string',
 *     length: { min: 2, max: 5 }
 *   }
 *   email: {
 *     type: 'string',
 *     required: true
 *   }
 * }
 *
 * Returns: {
 *   name: { length: { min:2, max: 5 }},
 *   email: { required: true }
 * }
 */

Validator.prototype.initialize = function(attrs, types, defaults, criteria) {
  var self = this;

  defaults = defaults || {};

  this.reservedProperties = ['defaultsTo', 'primaryKey', 'autoIncrement', 'unique', 'index', 'collection', 'dominant', 'through',
          'columnName', 'foreignKey', 'references', 'on', 'groupKey', 'model', 'via', 'size', 'criteria',
          'example', 'validationMessage', 'validations', 'populateSettings', 'onKey', 'protected'];


  if (defaults.ignoreProperties && Array.isArray(defaults.ignoreProperties)) {
    this.reservedProperties = this.reservedProperties.concat(defaults.ignoreProperties);
  }

  this.criteria = criteria;

  this.defaults = {};
  if (this.criteria) {
    _.keys(this.criteria).forEach(function(key) {
      if (!attrs[key]) {
        return;
      }
      if (_.isObject(self.criteria[key])) {
        return;
      }
      self.defaults[key] = self.criteria[key];
    });
  }

  // add custom type definitions to validator
  types = types || {};
  validator.define(types);

  Object.keys(attrs).forEach(function(attr) {
    self.validations[attr] = {};

    Object.keys(attrs[attr]).forEach(function(prop) {

      // Ignore null values
      if (attrs[attr][prop] === null) return;

      if (prop === 'collection' && attrs[attr].criteria) {
        if (!self.childValidators) {
          self.childValidators = {};
        }
        self.childValidators[attr] = new ChildValidator(self.context);
        self.childValidators[attr].initialize(attrs[attr].collection, attrs[attr].criteria);
      }

      // If property is reserved don't do anything with it
      if (self.reservedProperties.indexOf(prop) > -1) return;

      // use the Offshore-validator `in` method for enums
      if (prop === 'enum') {
        self.validations[attr]['in'] = attrs[attr][prop];
        return;
      }

      self.validations[attr][prop] = attrs[attr][prop];
    });
  });
};

/**
 * Validate
 *
 * Accepts an object of values and runs them through the
 * schema's validations using Offshore-validator.
 *
 * @param {Object} values to check
 * @param {Boolean|String|String[]} presentOnly only validate present values (if `true`) or
 * validate the specified attribute(s).
 * @param {Function} callback
 * @return Array of errors
 */

Validator.prototype.validate = function(values, presentOnly, cb) {
  var self = this;
  var errors = {};
  var validations = Object.keys(this.validations);

  // Handle optional second arg AND Use present values only, specified values, or all validations
  /* eslint-disable no-fallthrough */
  switch (typeof presentOnly) {
    case 'function':
      cb = presentOnly;
      break;
    case 'string':
      validations = [presentOnly];
      break;
    case 'object':
      if (Array.isArray(presentOnly)) {
        validations = presentOnly;
        break;
      } // Fall through to the default if the object is not an array
    default:
      // Any other truthy value.
      if (presentOnly) {
        validations = _.intersection(validations, Object.keys(values));
      }
    /* eslint-enable no-fallthrough */
  }

  function validate(validation, cb) {
    var curValidation = self.validations[validation];

    // Build Requirements
    var requirements = _.cloneDeep(validator(curValidation));

    // Grab value and set to null if undefined
    var value = values[validation];
    if (typeof value == 'undefined') value = null;

    // If value is not required and empty then don't
    // try and validate it
    if (!curValidation.required) {
      if (value === null || value === '') return cb();
    }

    // If Boolean and required manually check
    if (curValidation.required && curValidation.type === 'boolean' && (typeof value !== 'undefined' && value !== null)) {
      if (value.toString() == 'true' || value.toString() == 'false') return cb();
    }

    // If type is integer and the value matches a mongoID let it validate
    if (hasOwnProperty(self.validations[validation], 'type') && self.validations[validation].type === 'integer') {
      if (utils.matchMongoId(value)) return cb();
    }

    // Rule values may be specified as sync or async functions.
    // Call them and replace the rule value with the function's result
    // before running validations.
    async.each(Object.keys(requirements.data), function(key, cb) {
      if (typeof requirements.data[key] !== 'function') return cb();

      // Run synchronous function
      if (requirements.data[key].length < 1) {
        requirements.data[key] = requirements.data[key].apply(values, []);
        return cb();
      }

      // Run async function
      requirements.data[key].call(values, function(result) {
        requirements.data[key] = result;
        cb();
      });
    }, function() {

      // If the value has a dynamic required function and it evaluates to false lets look and see
      // if the value supplied is null or undefined. If so then we don't need to check anything. This
      // prevents type errors like `undefined` should be a string.
      // if required is set to 'false', don't enforce as required rule
      if (requirements.data.hasOwnProperty('required') && !requirements.data.required) {
        if (value === null) return cb();
      }

      // Validate with Offshore-validator
      var err = validator(value).to(requirements.data, values);

      // If No Error return
      if (!err) return cb();

      // Build an Error Object
      errors[validation] = [];

      err.forEach(function(obj) {
        if (obj.property) delete obj.property;
        errors[validation].push({ rule: obj.rule, message: obj.message });
      });

      return cb();
    });

  }

  // Validate all validations in parallel
  async.each(validations, validate, function allValidationsChecked() {
    //affecting default values specified in the model criteria to the record to insert if they don't exist
    values = _.defaults(values, self.defaults);

    var validated = offshoreCriteria([values], {where: self.criteria ? self.criteria.where : void 0}).results[0];
    if (!validated) {
      errors.Criteria = [{rule: 'modelCriteria',
          message: 'Object :\n' + require('util').inspect(values) + ' does not respect criteria defined in the model.'}];
    }

    if (Object.keys(errors).length === 0) return cb();

    cb(errors);
  });

};