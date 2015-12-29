var _ = require('lodash');
var offshoreCriteria = require('offshore-criteria');

var ChildValidator = module.exports = function(context) {
  this.context = context;
};

ChildValidator.prototype.initialize = function(collectionName, criteria) {
  this.collectionName = collectionName;
  this.criteria = criteria;
};

ChildValidator.prototype.validate = function(values, presentOnly, cb) {
  var self = this;
  var errors = {};
  // if true, defaults not already created ,creating it
  if (!this.defaults) {
    this.defaults = {};
    if (this.criteria) {
      _.keys(this.criteria).forEach(function(key) {
        if (!self.context.offshore.collections[self.collectionName]._attributes[key])
          return;
        if (_.isObject(self.criteria[key]))
          return;
        self.defaults[key] = self.criteria[key];
      });
    }
  }
  values = _.defaults(values, this.defaults);

  var result = offshoreCriteria([values], {where: this.criteria ? this.criteria.where : void 0}).results[0];
  if (!result) {
    errors.Criteria = [{rule: 'associationCriteria',
        message: 'Child objects :\n' + require('util').inspect(values) + ' do not respect criteria specified in the collection.'}];
    return cb(errors);
  }
  // calling model validation after validating association criteria
  this.context.offshore.collections[this.collectionName]._validator.validate(values, presentOnly, cb);
};