/**
 * Basic Finder Queries
 */

var usageError = require('../../utils/usageError');
var utils = require('../../utils/helpers');
var normalize = require('../../utils/normalize');
var sorter = require('../../utils/sorter');
var Deferred = require('../deferred');
var Joins = require('./joins');
var Operations = require('./operations');
var Integrator = require('../integrator');
var offshoreCriteria = require('offshore-criteria');
var _ = require('lodash');
var async = require('async');
var hasOwnProperty = utils.object.hasOwnProperty;

function groupBy( array , groupBykeys, fct) {
  var groups = {};
  array.forEach(function(item) {
    var groupValues = [];
    groupBykeys.forEach(function(key) {
      groupValues.push(item[key]);
    });
    var group = JSON.stringify(groupValues);
    groups[group] = groups[group] || [];
    groups[group].push(item);
  });
  return Object.keys(groups).map(function(group){
    return fct(groups[group]);
  });
}

module.exports = {

  /**
   * Find a single record that meets criteria
   *
   * @param {Object} criteria to search
   * @param {Function} callback
   * @return Deferred object if no callback
   */

  findOne: function(criteria, cb, metaContainer) {
    var self = this;

    if (typeof criteria === 'function') {
      cb = criteria;
      criteria = null;
    }

    // If the criteria is an array of objects, wrap it in an "or"
    if (Array.isArray(criteria) && _.every(criteria, function(crit) {return _.isObject(crit);})) {
      criteria = {or: criteria};
    }

    // Check if criteria is an integer or string and normalize criteria
    // to object, using the specified primary key field.
    criteria = normalize.expandPK(self, criteria);

    // Normalize criteria
    criteria = normalize.criteria(criteria);

    // Return Deferred or pass to adapter
    if (typeof cb !== 'function') {
      return new Deferred(this, this.findOne, criteria);
    }

    // Transform Search Criteria
    criteria = self._transformer.serialize(criteria);

    // If a projection is being used, ensure that the Primary Key is included
    if(criteria.select) {
      _.each(this._schema.schema, function(val, key) {
        if (_.has(val, 'primaryKey') && val.primaryKey) {
          criteria.select.push(key);
        }
      });

      criteria.select = _.uniq(criteria.select);
    }

    // serialize populated object
    if (criteria.joins) {
      criteria.joins.forEach(function(join) {
        if (join.criteria && join.criteria.where) {
          var joinCollection = self.offshore.collections[join.child];
          join.criteria.where = joinCollection._transformer.serialize(join.criteria.where);
        }
      });
    }

    // If there was something defined in the criteria that would return no results, don't even
    // run the query and just return an empty result set.
    if (criteria === false || criteria.where === null) {
      // Build Default Error Message
      var err = '.findOne() requires a criteria. If you want the first record try .find().limit(1)';
      return cb(new Error(err));
    }

    // Build up an operations set
    var operations = new Operations(self, criteria, 'findOne', metaContainer);

    // Run the operations
    operations.run(function(err, values) {
      if (err) return cb(err);
      if (!values.cache) return cb();

      // If no joins are used grab the only item from the cache and pass to the returnResults
      // function.
      if (!criteria.joins) {
        values = values.cache[self.identity];
        return returnResults(values);
      }

      // If the values are already combined, return the results
      if (values.combined) {
        return returnResults(values.cache[self.identity]);
      }
      // Find the primaryKey of the current model so it can be passed down to the integrator.
      // Use 'id' as a good general default;
      var primaryKey = 'id';

      Object.keys(self._schema.schema).forEach(function(key) {
        if (self._schema.schema[key].hasOwnProperty('primaryKey') && self._schema.schema[key].primaryKey) {
          primaryKey = key;
        }
      });

      // Perform in-memory joins
      Integrator(values.cache, criteria.joins, primaryKey, function(err, results) {
        if (err) return cb(err);
        if (!results) return cb();

        // We need to run one last check on the results using the criteria. This allows a self
        // association where we end up with two records in the cache both having each other as
        // embedded objects and we only want one result. However we need to filter any join criteria
        // out of the top level where query so that searchs by primary key still work.
        var tmpCriteria = _.cloneDeep(criteria.where);
        if (!tmpCriteria) tmpCriteria = {};

        criteria.joins.forEach(function(join) {
          if (!hasOwnProperty(join, 'parentKey')) return;

          // Check for `OR` criteria
          if (hasOwnProperty(tmpCriteria, 'or')) {
            tmpCriteria.or.forEach(function(search) {
              if (hasOwnProperty(search, join.parentKey)) {
                delete search[join.parentKey];
              }
            });
            return;
          }

          if (hasOwnProperty(tmpCriteria, join.parentKey)) {
            delete tmpCriteria[join.parentKey];
          }
        });

        // Pass results into Offshore-Criteria
        var _criteria = { where: tmpCriteria };
        results = offshoreCriteria('parent', { parent: results }, _criteria).results;
        results.forEach(function(res) {

          // Go Ahead and perform any sorts on the associated data
          criteria.joins.forEach(function(join) {
            if (!join.criteria) return;
            var c = normalize.criteria(join.criteria);
            var alias = join.alias;

            if (c.average && _.isArray(res[alias])) {
              if (c.groupBy && _.isArray(c.groupBy)) {
                res[alias] = groupBy(res[alias], c.groupBy, function(group) {
                  var average = {};
                  c.groupBy.forEach(function(groupBy) {
                    average[groupBy] = group[0][groupBy];
                  });
                  average[c.average[0]] = _.meanBy(group, function(item) {
                    return item[c.average[0]];
                  });
                  return average;
                });
              } else {
                var average = {};
                average[c.average[0]] = _.meanBy(res[alias], function(item) {
                  return item[c.average[0]];
                });
                res[alias] = [average];
              }
            }

            if (c.min && _.isArray(res[alias])) {
              if (c.groupBy && _.isArray(c.groupBy)) {
                res[alias] = groupBy(res[alias], c.groupBy, function(group) {
                  var min = {};
                  c.groupBy.forEach(function(groupBy) {
                    min[groupBy] = group[0][groupBy];
                  });
                  min[c.min[0]] = _.minBy(group, function(item) {
                    return item[c.min[0]];
                  });
                  return min;
                });
              } else {
                var min = {};
                min[c.min[0]] = _.minBy(res[alias], function(item) {
                  return item[c.min[0]];
                })[c.min[0]];
                res[alias] = [min];
              }
            }

            if (c.max && _.isArray(res[alias])) {
              if (c.groupBy && _.isArray(c.groupBy)) {
                res[alias] = groupBy(res[alias], c.groupBy, function(group) {
                  var max = {};
                  c.groupBy.forEach(function(groupBy) {
                    max[groupBy] = group[0][groupBy];
                  });
                  max[c.max[0]] = _.maxBy(group, function(item) {
                    return item[c.max[0]];
                  });
                  return max;
                });
              } else {
                var max = {};
                max[c.max[0]] = _.maxBy(res[alias], function(item) {
                  return item[c.max[0]];
                })[c.max[0]];
                res[alias] = [max];
              }
            }

            if (c.sum && _.isArray(res[alias])) {
              if (c.groupBy && _.isArray(c.groupBy)) {
                res[alias] = groupBy(res[alias], c.groupBy, function(group) {
                  var sum = {};
                  c.groupBy.forEach(function(groupBy) {
                    sum[groupBy] = group[0][groupBy];
                  });
                  sum[c.sum[0]] = _.sumBy(group, function(item) {
                    return item[c.sum[0]];
                  });
                  return sum;
                });
              } else {
                var sum = {};
                sum[c.sum[0]] = _.sumBy(res[alias], function(item) {
                  return item[c.sum[0]];
                });
                res[alias] = [sum];
              }
            }
            if (!c.sort) return;

            res[alias] = sorter(res[alias], c.sort);
          });
        });

        returnResults(results);
      });

      function returnResults(results) {

        if (!results) return cb();

        // Normalize results to an array
        if (!Array.isArray(results) && results) results = [results];

        // Unserialize each of the results before attempting any join logic on them
        var unserializedModels = [];
        results.forEach(function(result) {
          unserializedModels.push(self._transformer.unserialize(result));
        });

        var models = [];
        var joins = criteria.joins ? criteria.joins : [];
        var data = new Joins(joins, unserializedModels, self.identity, self._schema.schema, self.offshore.collections);

        // If `data.models` is invalid (not an array) return early to avoid getting into trouble.
        if (!data || !data.models || !data.models.forEach) {
          return cb(new Error('Values returned from operations set are not an array...'));
        }

        // Create a model for the top level values
        data.models.forEach(function(model) {
          models.push(new self._model(model, data.options)._loadQuery(self._query));
        });

        cb(null, models[0]);
      }
    });
  },

  /**
   * Find All Records that meet criteria
   *
   * @param {Object} search criteria
   * @param {Object} options
   * @param {Function} callback
   * @return Deferred object if no callback
   */

  find: function(criteria, options, cb, metaContainer) {
    var self = this;
    var usage = utils.capitalize(this.identity) + '.find([criteria],[options]).exec(callback|switchback)';

    if (typeof criteria === 'function') {
      cb = criteria;
      criteria = null;

      if(arguments.length === 1) {
        options = null;
      }
    }

    // If options is a function, we want to check for any more values before nulling
    // them out or overriding them.
    if (typeof options === 'function') {

      // If cb also exists it means there is a metaContainer value
      if (cb) {
        metaContainer = cb;
        cb = options;
        options = null;
      } else {
        cb = options;
        options = null;
      }

    }

    // If the criteria is an array of objects, wrap it in an "or"
    if (Array.isArray(criteria) && _.every(criteria, function(crit) {return _.isObject(crit);})) {
      criteria = {or: criteria};
    }

    // Check if criteria is an integer or string and normalize criteria
    // to object, using the specified primary key field.
    criteria = normalize.expandPK(self, criteria);

    // Normalize criteria
    criteria = normalize.criteria(criteria);

    // Validate Arguments
    if (typeof criteria === 'function' || typeof options === 'function') {
      return usageError('Invalid options specified!', usage, cb);
    }

    // Return Deferred or pass to adapter
    if (typeof cb !== 'function') {
      return new Deferred(this, this.find, criteria, options);
    }

    // If there was something defined in the criteria that would return no results, don't even
    // run the query and just return an empty result set.
    if (criteria === false) {
      return cb(null, []);
    }

    // Fold in options
    if (options === Object(options) && criteria === Object(criteria)) {
      criteria = _.extend({}, criteria, options);
    }

    // If a projection is being used, ensure that the Primary Key is included
    if(criteria.select) {
      _.each(this._schema.schema, function(val, key) {
        if (_.has(val, 'primaryKey') && val.primaryKey) {
          criteria.select.push(key);
        }
      });

      criteria.select = _.uniq(criteria.select);
    }

    // Transform Search Criteria
    if (!self._transformer) {
      throw new Error('Offshore can not access transformer-- maybe the context of the method is being overridden?');
    }
    criteria = self._transformer.serialize(criteria);



    // serialize populated object
    if (criteria.joins) {
      criteria.joins.forEach(function(join) {
        var joinCollection = self.offshore.collections[join.child];
        if (join.criteria && join.criteria.where) {
          join.criteria.where = joinCollection._transformer.serialize(join.criteria.where);
        }
        if (join.criteria && join.criteria.sort) {
          join.criteria.sort = joinCollection._transformer.serialize(join.criteria.sort);
        }
      });
    }

    // Build up an operations set
    var operations = new Operations(self, criteria, 'find', metaContainer);

    // Run the operations
    operations.run(function(err, values) {
      if (err) return cb(err);
      if (!values.cache) return cb();

      // If no joins are used grab current collection's item from the cache and pass to the returnResults
      // function.
      if (!criteria.joins) {
        values = values.cache[self.identity];
        return returnResults(values);
      }

      // If the values are already combined, return the results
      if (values.combined) {
        return returnResults(values.cache[self.identity]);
      }

      // Find the primaryKey of the current model so it can be passed down to the integrator.
      // Use 'id' as a good general default;
      var primaryKey = 'id';

      Object.keys(self._schema.schema).forEach(function(key) {
        if (self._schema.schema[key].hasOwnProperty('primaryKey') && self._schema.schema[key].primaryKey) {
          primaryKey = key;
        }
      });

      // Perform in-memory joins
      Integrator(values.cache, criteria.joins, primaryKey, function(err, results) {
        if (err) return cb(err);
        if (!results) return cb();

        // We need to run one last check on the results using the criteria. This allows a self
        // association where we end up with two records in the cache both having each other as
        // embedded objects and we only want one result. However we need to filter any join criteria
        // out of the top level where query so that searchs by primary key still work.
        var tmpCriteria = _.cloneDeep(criteria.where);
        if (!tmpCriteria) tmpCriteria = {};

        criteria.joins.forEach(function(join) {
          if (!hasOwnProperty(join, 'parentKey')) return;

          // Check for `OR` criteria
          if (hasOwnProperty(tmpCriteria, 'or')) {
            tmpCriteria.or.forEach(function(search) {
              if (hasOwnProperty(search, join.parentKey)) {
                delete search[join.parentKey];
              }
            });
            return;
          }

          if (hasOwnProperty(tmpCriteria, join.parentKey)) {
            delete tmpCriteria[join.parentKey];
          }
        });

        // Pass results into Offshore-Criteria
        var _criteria = { where: tmpCriteria };

        results = offshoreCriteria('parent', { parent: results }, _criteria).results;
        // Serialize values coming from an in-memory join before modelizing
        results.forEach(function(res) {

          // Go Ahead and perform any sorts on the associated data
          criteria.joins.forEach(function(join) {
            if (!join.criteria) return;
            var c = normalize.criteria(join.criteria);
            var alias = join.alias;
            if (c.sort) {
              res[alias] = sorter(res[alias], c.sort);
            }

            if (c.average && _.isArray(res[alias])) {
              if (c.groupBy && _.isArray(c.groupBy)) {
                res[alias] = groupBy(res[alias], c.groupBy, function(group) {
                  var average = {};
                  c.groupBy.forEach(function(groupBy) {
                    average[groupBy] = group[0][groupBy];
                  });
                  average[c.average[0]] = _.meanBy(group, function(item) {
                    return item[c.average[0]];
                  });
                  return average;
                });
              } else {
                var average = {};
                average[c.average[0]] = _.meanBy(res[alias], function(item) {
                  return item[c.average[0]];
                });
                res[alias] = [average];
              }
            }

            if (c.min && _.isArray(res[alias])) {
              if (c.groupBy && _.isArray(c.groupBy)) {
                res[alias] = groupBy(res[alias], c.groupBy, function(group) {
                  var min = {};
                  c.groupBy.forEach(function(groupBy) {
                    min[groupBy] = group[0][groupBy];
                  });
                  min[c.min[0]] = _.minBy(group, function(item) {
                    return item[c.min[0]];
                  });
                  return min;
                });
              } else {
                var min = {};
                min[c.min[0]] = _.minBy(res[alias], function(item) {
                  return item[c.min[0]];
                })[c.min[0]];
                res[alias] = [min];
              }
            }

            if (c.max && _.isArray(res[alias])) {
              if (c.groupBy && _.isArray(c.groupBy)) {
                res[alias] = groupBy(res[alias], c.groupBy, function(group) {
                  var max = {};
                  c.groupBy.forEach(function(groupBy) {
                    max[groupBy] = group[0][groupBy];
                  });
                  max[c.max[0]] = _.maxBy(group, function(item) {
                    return item[c.max[0]];
                  });
                  return max;
                });
              } else {
                var max = {};
                max[c.max[0]] = _.maxBy(res[alias], function(item) {
                  return item[c.max[0]];
                })[c.max[0]];
                res[alias] = [max];
              }
            }

            if (c.sum && _.isArray(res[alias])) {
              if (c.groupBy && _.isArray(c.groupBy)) {
                res[alias] = groupBy(res[alias], c.groupBy, function(group) {
                  var sum = {};
                  c.groupBy.forEach(function(groupBy) {
                    sum[groupBy] = group[0][groupBy];
                  });
                  sum[c.sum[0]] = _.sumBy(group, function(item) {
                    return item[c.sum[0]];
                  });
                  return sum;
                });
              } else {
                var sum = {};
                sum[c.sum[0]] = _.sumBy(res[alias], function(item) {
                  return item[c.sum[0]];
                });
                res[alias] = [sum];
              }
            }

            // If a junction table was used we need to do limit and skip in-memory
            // This is where it gets nasty, paginated stuff here is a pain and needs work
            // Hopefully we can get a chance to re-do it in WL2 and not have this. Basically
            // if you need paginated populates try and have all the tables in the query on the
            // same connection so it can be done in a nice single query.
            if (!join.junctionTable) return;

            if (c.skip) {
              res[alias].splice(0, c.skip);
            }

            if (c.limit) {
              res[alias] = _.take(res[alias], c.limit);
            }

          });
        });

        returnResults(results);
      });

      function returnResults(results) {

        if (!results) return cb(null, []);

        // Normalize results to an array
        if (!Array.isArray(results) && results) results = [results];

        // Unserialize each of the results before attempting any join logic on them
        var unserializedModels = [];

        if (results) {
          results.forEach(function(result) {
            unserializedModels.push(self._transformer.unserialize(result));
          });
        }

        var models = [];
        var joins = criteria.joins ? criteria.joins : [];
        var data = new Joins(joins, unserializedModels, self.identity, self._schema.schema, self.offshore.collections);

        // NOTE:
        // If a "belongsTo" (i.e. HAS_FK) association is null, should it be transformed into
        // an empty array here?  That is not what is happening currently, and it can cause
        // unexpected problems when implementing the native join method as an adapter implementor.
        // ~Mike June 22, 2014

        // If `data.models` is invalid (not an array) return early to avoid getting into trouble.
        if (!data || !data.models || !data.models.forEach) {
          return cb(new Error('Values returned from operations set are not an array...'));
        }

        // Create a model for the top level values
        data.models.forEach(function(model) {
          models.push(new self._model(model, data.options)._loadQuery(self._query));
        });

        cb(null, models);
      }

    });
  },

  where: function() {
    this.find.apply(this, Array.prototype.slice.call(arguments));
  },

  select: function() {
    this.find.apply(this, Array.prototype.slice.call(arguments));
  },


  /**
   * findAll
   * [[ Deprecated! ]]
   *
   * @param  {Object}   criteria
   * @param  {Object}   options
   * @param  {Function} cb
   */
  findAll: function(criteria, options, cb) {
    if (typeof criteria === 'function') {
      cb = criteria;
      criteria = null;
      options = null;
    }

    if (typeof options === 'function') {
      cb = options;
      options = null;
    }

    // Return Deferred or pass to adapter
    if (typeof cb !== 'function') {
      return new Deferred(this, this.findAll, criteria);
    }

    cb(new Error('In Offshore >= 0.9, findAll() has been deprecated in favor of find().' +
                '\nPlease visit the migration guide at http://sailsjs.org for help upgrading.'));
  }

};
