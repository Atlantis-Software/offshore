/**
 * Deferred Object
 *
 * Used for building up a Query
 */

var util = require('util');
var Promise = require('bluebird');
var _ = require('lodash');
var normalize = require('../utils/normalize');
var utils = require('../utils/helpers');
var acyclicTraversal = require('../utils/acyclicTraversal');
var hasOwnProperty = utils.object.hasOwnProperty;
var async = require('async');
var DeepCursor = require('./deepCursor');
var Criteria = require('./criteria');
var crypto = require('crypto');

// Alias "catch" as "fail", for backwards compatibility with projects
// that were created using Q
Promise.prototype.fail = Promise.prototype.catch;

var Deferred = module.exports = function(context, method, criteria, values) {

  if (!context) {
    return new Error('Must supply a context to a new Deferred object. Usage: new Deferred(context, method, criteria)');
  }
  if (!method) {
    return new Error('Must supply a method to a new Deferred object. Usage: new Deferred(context, method, criteria)');
  }

  this._context = context;
  this._method = method;

  // define the methodName
  var methods = ['find', 'findOne', 'findOrCreate', 'createEach', 'findOrCreateEach', 'count', 'create', 'destroy', 'update', 'findAll'];
  this._methodName = _.find(methods.concat(_.keys(context)), function(key) {
    return context[key] === method;
  }) || 'unknownMethod';

  this._criteria = criteria;
  this._values = values || null;

  this._deferred = null; // deferred object for promises

  return this;
};

Deferred.prototype.toString = function() {
  var criteria = Criteria.toString(this._criteria);
  var str = this._context.identity + '.' + this._methodName + '(' + criteria + ')';

  // check if there are deep populate
  if (this._criteria.paths) {
    var paths = _.sortBy(_.keys(this._criteria.paths), function(name) {
      return name;
    });
    for (var path in paths) {
      var joins = this._criteria.paths[path].joins;
      // sort joins by alias
      _.sortBy(joins, function(join) {
        return join.alias;
      }).forEach(function(join) {
        if (!join.junctionTable) {
          var joinCriteria = Criteria.toString(join.criteria);
          str += '.populate(' + path + '.' + join.alias + ',' + joinCriteria + ')';
        }
      });
    }
  } else if (this._criteria.joins) {
    // sort join by alias
    _.sortBy(this._criteria.joins, function(join) {
      return join.alias;
    }).forEach(function(join) {
      if (!join.junctionTable) {
        var joinCriteria = Criteria.toString(join.criteria);
        str += '.populate(' + join.alias + ',' + joinCriteria + ')';
      }
    });
  }
  return str;
};

/**
 * Add join clause(s) to the criteria object to populate
 * the specified alias all the way down (or at least until a
 * circular pattern is detected.)
 *
 * @param  {String} keyName  [the initial alias aka named relation]
 * @param  {Object} criteria [optional]
 * @return this
 * @chainable
 *
 * WARNING:
 * This method is not finished yet!!
 */
Deferred.prototype.populateDeep = function(keyName, criteria) {

  // The identity of the initial model
  var identity = this._context.identity;

  // The input schema
  var schema = this._context.offshore.schema;

  // Kick off recursive function to traverse the schema graph.
  var plan = acyclicTraversal(schema, identity, keyName);

  // TODO: convert populate plan into a join plan
  // this._criteria.joins = ....

  // TODO: also merge criteria object into query

  return this;
};

/**
 * Populate all associations of a collection.
 *
 * @return this
 * @chainable
 */
Deferred.prototype.populateAll = function(criteria) {
  var self = this;
  this._context.associations.forEach(function(association) {
    self.populate(association.alias, criteria);
  });
  return this;

};

/**
 * Set _cacheKey and _cacheTime before execute the request.
 *
 * @param {String} key, the key to identify cache.
 * @param {Integer} time, the maximum time the cache must be used.
 * @param {Function} cb, callback
 * @return callback with parameters (err, results)
 */
Deferred.prototype.cache = function(key, time, cb) {
  var self = this;
  var callback, cacheKey, cacheTime;

  if (this._methodName !== 'find' && this._methodName !== 'findOne') {
    return cb(new Error(this._methodName + ' can not be cached'));
  }

  // define optional parameters
  if (cb && _.isFunction(cb)) {
    callback = cb;
    cacheTime = time;
    cacheKey = key;
  } else if (time && _.isFunction(time)) {
    callback = time;
    cacheTime = key;
  } else if (key && _.isFunction(key)) {
    callback = key;
  } else {
    console.log(new Error('Error: No Callback supplied, you must define a callback.').message);
    return;
  }

  cacheKey = cacheKey || crypto.createHash('sha1').update(this.toString()).digest('hex');

  if (cacheTime && !_.isNumber(cacheTime)) {
    throw new Error('Cache Time must be a number');
  }

  if (!_.isString(cacheKey)) {
    throw new Error('Cache Key must be a string');
  }
  // Check cache
  this._context.offshore.cache.get(cacheKey, function(err, cache) {
    if (err) {
      // if no cache
      if (err === self._context.offshore.cache.errors.NO_CACHE) {
        // execute the request and cache results
        return self.exec(function(err, data) {
          if (err) {
            return callback(err);
          }
          self._context.offshore.cache.set(cacheKey, data, cacheTime);
          callback(null, data);
        });
      }
      // return the error
      return callback(err);
    }
    // cache found return its value
    return callback(null, cache);
  });
};

/**
 * Add a `joins` clause to the criteria object.
 *
 * Used for populating associations.
 *
 * @param {String|Array} key, the key to populate or array of string keys
 * @return this
 * @chainable
 */

Deferred.prototype.populate = function(keyName, criteria) {

  var self = this;
  var joins = [];
  var pk = 'id';
  var attr;
  var join;

  // Adds support for arrays into keyName so that a list of
  // populates can be passed
  if (_.isArray(keyName)) {
    keyName.forEach(function(populate) {
      self.populate(populate, criteria);
    });
    return this;
  }

  // Normalize sub-criteria
  try {
    criteria = normalize.criteria(criteria);
    if (keyName && keyName.indexOf('.') > -1) {
      return self.populatePath(keyName, criteria);
    }
    ////////////////////////////////////////////////////////////////////////
    // TODO:
    // instead of doing this, target the relevant pieces of code
    // with weird expectations and teach them a lesson
    // e.g. `lib/offshore/query/finders/operations.js:665:12`
    // (delete userCriteria.sort)
    //
    // Except make sure `where` exists
    criteria.where = criteria.where === false ? false : (criteria.where || {});
    ////////////////////////////////////////////////////////////////////////

  } catch (e) {
    throw new Error(
      'Could not parse sub-criteria passed to ' +
      util.format('`.populate("%s")`', keyName) +
      '\nSub-criteria:\n' + util.inspect(criteria, false, null) +
      '\nDetails:\n' + util.inspect(e, false, null)
      );
  }

  try {

    // Set the attr value to the generated schema attribute
    attr = this._context.offshore.schema[this._context.identity].attributes[keyName];

    // Get the current collection's primary key attribute
    Object.keys(this._context._attributes).forEach(function(key) {
      if (hasOwnProperty(self._context._attributes[key], 'primaryKey') && self._context._attributes[key].primaryKey) {
        pk = self._context._attributes[key].columnName || key;
      }
    });

    if (!attr) {
      throw new Error(
        'In ' + util.format('`.populate("%s")`', keyName) +
        ', attempting to populate an attribute that doesn\'t exist'
      );
    }

    // Grab the key being populated to check if it is a has many to belongs to
    // If it's a belongs_to the adapter needs to know that it should replace the foreign key
    // with the associated value.
    var parentKey = this._context.offshore.collections[this._context.identity].attributes[keyName];

    // Build the initial join object that will link this collection to either another collection
    // or to a junction table.
    join = {
      parent: this._context.identity,
      parentKey: attr.columnName || pk,
      child: attr.references,
      childKey: attr.on,
      alias: keyName,
      removeParentKey: !!parentKey.model,
      model: !!hasOwnProperty(parentKey, 'model'),
      collection: !!hasOwnProperty(parentKey, 'collection')
    };

    // Build select object to use in the integrator
    var select = [];
    var customSelect = criteria.select && _.isArray(criteria.select);
    _.each(this._context.offshore.schema[attr.references].attributes, function(val, key) {
      // Ignore virtual attributes
      if(_.has(val, 'collection')) {
        return;
      }

      // Check if the user has defined a custom select and if so normalize it
      if(customSelect && !_.includes(criteria.select, key)) {
        return;
      }

      if (!_.has(val, 'columnName')) {
        select.push(key);
        return;
      }

      select.push(val.columnName);
    });

    // Ensure the PK and FK on the child are always selected - otherwise things
    // like the integrator won't work correctly
    var childPk;
    _.each(this._context.offshore.schema[attr.references].attributes, function(val, key) {
      if(_.has(val, 'primaryKey') && val.primaryKey) {
        childPk = val.columnName || key;
      }
    });

    select.push(childPk);

    // Add the foreign key for collections
    if(join.collection) {
      select.push(attr.on);
    }

    join.select = select;

    var schema = this._context.offshore.schema[attr.references];
    var reference = null;

    // If linking to a junction table the attributes shouldn't be included in the return value
    if (schema.junctionTable) {
      join.select = false;
      reference = _.find(schema.attributes, function(attribute) {
        return attribute.references && attribute.columnName !== attr.on;
      });
    } else if (schema.throughTable && schema.throughTable[self._context.identity + '.' + keyName]) {
      join.select = false;
      reference = schema.attributes[schema.throughTable[self._context.identity + '.' + keyName]];
    }

    joins.push(join);

    // If a junction table is used add an additional join to get the data
    if (reference && hasOwnProperty(attr, 'on')) {
      var selects = [];
      _.each(this._context.offshore.schema[reference.references].attributes, function(val, key) {
        // Ignore virtual attributes
        if(_.has(val, 'collection')) {
          return;
        }

        // Check if the user has defined a custom select and if so normalize it
        if(customSelect && !_.includes(criteria.select, key)) {
          return;
        }

        if (!_.has(val, 'columnName')) {
          selects.push(key);
          return;
        }

        selects.push(val.columnName);
      });

      // Ensure the PK and FK are always selected - otherwise things like the
      // integrator won't work correctly
      _.each(this._context.offshore.schema[reference.references].attributes, function(val, key) {
        if(_.has(val, 'primaryKey') && val.primaryKey) {
          childPk = val.columnName || key;
        }
      });

      selects.push(childPk);

      join = {
        parent: attr.references,
        parentKey: reference.columnName,
        child: reference.references,
        childKey: reference.on,
        select: _.uniq(selects),
        alias: keyName,
        junctionTable: true,
        removeParentKey: !!parentKey.model,
        model: false,
        collection: true
      };

      joins.push(join);
    }

    // get the association default criteria
    criteria = Criteria.merge(criteria, this._context.offshore.collections[this._context.identity]._attributes[keyName].criteria);

    // Append the criteria to the correct join if available
    if (criteria && joins.length > 1) {
      joins[1].criteria = this._context.offshore.collections[joins[1].child]._transformer.serialize(criteria);
      joins[1].criteria.select = join.select;
    } else if (criteria) {
      joins[0].criteria = this._context.offshore.collections[joins[0].child]._transformer.serialize(criteria);
      joins[0].criteria.select = join.select;
    }

    // Set the criteria joins
    this._criteria.joins = Array.prototype.concat(this._criteria.joins || [], joins);

    return this;
  } catch (e) {
    throw new Error(
      'Encountered unexpected error while building join instructions for ' +
      util.format('`.populate("%s")`', keyName) +
      '\nDetails:\n' +
      util.inspect(e, false, null)
    );
  }
};

/**
 * populate a path
 */

Deferred.prototype.populatePath = function(path, criteria) {
  var self = this;
  var pathChunks = path.split('.');
  var collections = this._context.offshore.collections;
  var parentName = this._context.identity;
  var currentPath = this._context.identity;
  var parentAttributes = collections[parentName]._attributes;

  if (!this._criteria.paths) {
    this._criteria.paths = {};
    this._criteria.paths[currentPath] = {joins: [], children: {}};
  }
  if (this._criteria.joins) {
    var currentPathRef = this._criteria.paths[currentPath];
    for (var i in this._criteria.joins) {
      var join = this._criteria.joins[i];
      if (!currentPathRef.children[join.alias] || !currentPathRef.children[join.alias].primaryKey) {
        var collections = this._context.offshore.collections;
        var childAttr = collections[this._context.identity].attributes[join.alias];
        var childCollection = childAttr.collection || childAttr.model;
        currentPathRef.children[join.alias] = {
          collectionName: childCollection,
          primaryKey: _.find(_.keys(collections[childCollection].attributes), function(attr) {
            return collections[childCollection].attributes[attr].primaryKey;
          })
        };
      }
    }
  }

  for (var j = 0; j < pathChunks.length; j++) {
    var currentAlias = pathChunks[j];
    if (!parentAttributes[currentAlias] || !(parentAttributes[currentAlias].model || parentAttributes[currentAlias].collection)) {
      throw new Error(
        'In ' + util.format('`.populate("%s")`', path) +
        ', attempting to populate an attribute that doesn\'t exist'
      );
    }
    var childName = parentAttributes[currentAlias].model || parentAttributes[currentAlias].collection;
    if (!this._criteria.paths[currentPath]) {
      this._criteria.paths[currentPath] = {joins: [], children: {}};
    }

    // if true, the alias does not exist in the current path, adding it
    if (_.keys(this._criteria.paths[currentPath].children).indexOf(currentAlias) === -1) {
      var joins;
      var parent = this;
      if (parentName !== this._context.identity) {
        parent = collections[parentName].find();
      }
      if (_.last(pathChunks) === currentAlias) {
        joins = parent.populate(currentAlias, criteria)._criteria.joins;
      } else {
        joins = parent.populate(currentAlias)._criteria.joins;
      }

      self._criteria.paths[currentPath].joins = Array.prototype.concat(self._criteria.paths[currentPath].joins || [], joins);

      var childAttributes = collections[childName].attributes;
      var childPk = _.find(_.keys(childAttributes), function(attr) {
        return childAttributes[attr].primaryKey;
      });

      this._criteria.paths[currentPath].children[currentAlias] = {collectionName: childName, primaryKey: childPk};
    }

    // child become parent for next loop
    parentName = childName;
    parentAttributes = collections[parentName]._attributes;
    currentPath += '.' + currentAlias;
  }

  this.exec = this.execDeep;
  return this;
};

Deferred.prototype.whereDeep = function(ParentName, where, cb) {
  var self = this;
  var values = _.clone(where);
  var collections = this._context.offshore.collections;
  var schema = this._context.offshore.schema[ParentName];
  var attributes = collections[ParentName].attributes;
  if (!where) {
    return cb(null, where);
  }
  async.map(_.keys(values), function(property, next) {

    // check if there is something to solve
    if ((property === 'or' || property === 'and') && _.isArray(values[property])) {
      return async.forEachOf(values[property], function(inner, index, next) {
        self.whereDeep(ParentName, inner, function(err, where) {
          if (err) {
            return next(err);
          }
          values[property][index] = where;
          next();
        });
      }, function(err) {
        if (err) {
          return next(err);
        }
        next(null, {key: property, value: values[property]});
      });
    }

    if (!attributes[property]) {
      return next(null, {key: property, value: values[property]});
    }

    if (!_.isPlainObject(values[property])) {
      return next(null, {key: property, value: values[property]});
    }

    var childName =  attributes[property]['collection'] || attributes[property]['model'];
    if (!childName) {
      return next(null, {key: property, value: values[property]});
    }

    // check if there is an attribute to resolve in criteria
    var childAttributes = _.keys(collections[childName].attributes);
    var deepKeys = function(obj) {
      if (obj && _.isObject(obj)) {
        var keys = [];
        if (_.isPlainObject(obj)) {
          keys = _.keys(obj);
        }
        for (key in obj) {
          keys = keys.concat(deepKeys(obj[key]));
        }
        return keys;
      }
      return [];
    };
    var criteriaKey = deepKeys(values[property]);
    var resolving = _.intersection(childAttributes, criteriaKey);

    if (resolving.length === 0) {
      return next(null, {key: property, value: values[property]});
    }

    // resolve hasMany
    if (hasOwnProperty(attributes[property], 'collection')) {
      var via = collections[ParentName].attributes[property].via;
      var childCollectionCriteria = _.clone(values[property]);
      // get the association default criteria
      childCollectionCriteria = Criteria.merge(childCollectionCriteria, collections[ParentName]._attributes[property].criteria);

      // offshore criteria should support {'!': null}
      // childCollectionCriteria[via] = {'!': null};
      collections[childName]._loadQuery(self._context._query).find(childCollectionCriteria).exec(function(err, data) {
        if (err) {
          return next(err);
        }
        var via = collections[ParentName].attributes[property].via;
        // if its a ManytoOne relation
        if (hasOwnProperty(collections[childName].attributes[via], 'model')) {
          var val = _.map(data, function(child) {
            return child[collections[ParentName].attributes[property].via];
          });

          val = _.filter(val, function(pk) {
            if (_.isUndefined(pk) || _.isNull(pk)) {
              return false;
            }
            return true;
          });

          return next(null, {
            key: collections[ParentName].primaryKey,
            value: _.uniq(val)
          });
        }
        // if it's a manyToMany relation
        var junctionTable;
        var junctionCriteria = {};
        // check if it's a throughTable
        if (hasOwnProperty(attributes[property], 'through')) {
          junctionTable = attributes[property]['through'];
          var associationKey = ParentName + '.' + property;
          var throughPk = self._context.offshore.schema[junctionTable].throughTable[associationKey];
          junctionCriteria[throughPk] = _.map(data, function(coll) {
            return coll[collections[childName].primaryKey];
          });
        } else {
          junctionTable = schema.attributes[property]['references'];
          var collectionSchema = self._context.offshore.schema[childName].attributes;
          junctionCriteria[collectionSchema[via].onKey || collectionSchema[via].on] = _.map(data, function(child) {
            return child[collections[childName].primaryKey];
          });
        }

        // get the association default criteria
        junctionCriteria = Criteria.merge(junctionCriteria, collections[ParentName]._attributes[property].criteria);

        collections[junctionTable]._loadQuery(self._context._query).find(junctionCriteria, function(err, data) {
          if (err) {
            return next(err);
          }
          next(null, {
            key: collections[ParentName].primaryKey,
            value: _.map(data, function(junction) {
              // throughTable
              if (hasOwnProperty(attributes[property], 'through')) {
                return junction[attributes[property].via];
              } else {
                // junctionTable
                return junction[schema.attributes[property].onKey || schema.attributes[property].on];
              }
            })
          });
        });
      });
    } else {
      // resolve belongsTo
      var child = collections[childName]._loadQuery(self._context._query);
      var belongToCriteria = _.clone(values[property]);

      // get the association default criteria
      belongToCriteria = Criteria.merge(belongToCriteria, collections[ParentName]._attributes[property].criteria);

      child.find(belongToCriteria).exec(function(err, data) {
        if (err) {
          return next(err);
        }
        next(null, {
          key: property,
          value: _.map(data, function(childData) {
            return childData[child.primaryKey];
          })
        });
      });
    }
  }, function(err, res) {
    if (err) {
      return cb(err);
    }

    if (!res.length) {
      return cb();
    }

    var where = {};
    res.forEach(function(keyObject) {
      if (where[keyObject.key] && _.isArray(where[keyObject.key]) && _.isArray(keyObject.value)) {
        where[keyObject.key] = _.intersection(where[keyObject.key], keyObject.value);
      } else {
        where[keyObject.key] = keyObject.value;
      }
    });
    cb(null, where);
  });
};

/**
 * Add projections to the parent
 *
 * @param {Array} attributes to select
 * @return this
 */

Deferred.prototype.select = function(attributes) {
  if(!_.isArray(attributes)) {
    attributes = [attributes];
  }

  var select = this._criteria.select || [];
  select = select.concat(attributes);
  this._criteria.select = _.uniq(select);

  return this;
};

/**
 * Add a Where clause to the criteria object
 *
 * @param {Object} criteria to append
 * @return this
 */

Deferred.prototype.where = function(criteria) {

  if (!criteria) {
    return this;
  }

  // If the criteria is an array of objects, wrap it in an "or"
  if (Array.isArray(criteria) && _.every(criteria, function(crit) { return _.isObject(crit); })) {
    criteria = {or: criteria};
  }

  // Normalize criteria
  criteria = normalize.criteria(criteria);

  // Wipe out the existing WHERE clause if the specified criteria ends up `false`
  // (since neither could match anything)
  if (criteria === false) {
    this._criteria = false;
  }

  if (!criteria || !criteria.where) {
    return this;
  }

  if (!this._criteria) {
    this._criteria = {};
  }
  var where = this._criteria.where || {};

  // Merge with existing WHERE clause
  Object.keys(criteria.where).forEach(function(key) {
    where[key] = criteria.where[key];
  });

  this._criteria.where = where;

  return this;
};

/**
 * Add a Limit clause to the criteria object
 *
 * @param {Integer} number to limit
 * @return this
 */

Deferred.prototype.limit = function(limit) {
  this._criteria.limit = limit;

  return this;
};

/**
 * Add a Skip clause to the criteria object
 *
 * @param {Integer} number to skip
 * @return this
 */

Deferred.prototype.skip = function(skip) {
  this._criteria.skip = skip;

  return this;
};

/**
 * Add a Paginate clause to the criteria object
 *
 * This is syntatical sugar that calls skip and
 * limit from a single function.
 *
 * @param {Object} page and limit
 * @return this
 */
Deferred.prototype.paginate = function(options) {
  var defaultLimit = 10;

  if (_.isUndefined(options)) {
    options = {page: 0, limit: defaultLimit};
  }

  var page = options.page || 0;
  var limit = options.limit || defaultLimit;
  var skip = 0;

  if (page > 0 && limit === 0) {
    skip = page - 1;
  }
  if (page > 0 && limit > 0) {
    skip = (page * limit) - limit;
  }

  this.skip(skip).limit(limit);

  return this;
};

/**
 * Add a groupBy clause to the criteria object
 *
 * @param {Array|Arguments} Keys to group by
 * @return this
 */
Deferred.prototype.groupBy = function() {
  buildAggregate.call(this, 'groupBy', Array.prototype.slice.call(arguments));
  return this;
};


/**
 * Add a Sort clause to the criteria object
 *
 * @param {String|Object} key and order
 * @return this
 */

Deferred.prototype.sort = function(criteria) {

  if (!criteria)
    return this;

  // Normalize criteria
  criteria = normalize.criteria({sort: criteria});

  var sort = this._criteria.sort || {};

  Object.keys(criteria.sort).forEach(function(key) {
    sort[key] = criteria.sort[key];
  });

  this._criteria.sort = sort;

  return this;
};

/**
 * Add a Sum clause to the criteria object
 *
 * @param {Array|Arguments} Keys to sum over
 * @return this
 */
Deferred.prototype.sum = function() {
  buildAggregate.call(this, 'sum', Array.prototype.slice.call(arguments));
  return this;
};

/**
 * Add an Average clause to the criteria object
 *
 * @param {Array|Arguments} Keys to average over
 * @return this
 */
Deferred.prototype.average = function() {
  buildAggregate.call(this, 'average', Array.prototype.slice.call(arguments));
  return this;
};

/**
 * Add a min clause to the criteria object
 *
 * @param {Array|Arguments} Keys to min over
 * @return this
 */
Deferred.prototype.min = function() {
  buildAggregate.call(this, 'min', Array.prototype.slice.call(arguments));
  return this;
};

/**
 * Add a min clause to the criteria object
 *
 * @param {Array|Arguments} Keys to min over
 * @return this
 */
Deferred.prototype.max = function() {
  buildAggregate.call(this, 'max', Array.prototype.slice.call(arguments));
  return this;
};


/**
 * Add values to be used in update or create query
 *
 * @param {Object, Array} values
 * @return this
 */

Deferred.prototype.set = function(values) {
  this._values = values;

  return this;
};

/**
 * Pass metadata down to the adapter that won't be processed or touched by Offshore
 */

Deferred.prototype.meta = function(data) {
  this._meta = data;
  return this;
};

/**
 * Execute a Query using the method passed into the
 * constuctor.
 *
 * @param {Function} callback
 * @return callback with parameters (err, results)
 */

Deferred.prototype.exec = function(cb) {
  var self = this;
  if (!cb) {
    console.log('Error: No Callback supplied, you must define a callback.');
    return;
  }

  // Normalize callback/switchback
  cb = normalize.callback(cb);

  var execute = function() {
    // Set up arguments + callback
    var args = [self._criteria, cb];
    if (self._values) {
      args.splice(1, 0, self._values);
    }

    // If there is a meta value, throw it on the very end
    if(this._meta) {
      args.push(this._meta);
    }

    // Pass control to the adapter with the appropriate arguments.
    self._method.apply(self._context, args);
  };

  var queryWhere = self._criteria ? self._criteria.where : null;
  if (this._criteria && this._criteria.joins && _.isArray(this._criteria.joins)) {
    async.parallel([function(next) {
        self.whereDeep(self._context.identity, queryWhere, function(err, where) {
          if (err) {
            return next(err);
          }
          if (self._criteria && where) {
            self._criteria.where = where;
          }
          next();
        });
      }, function(next) {
        async.forEachOf(self._criteria.joins, function(join, index, next) {
          if (!join.criteria || !join.criteria.where) {
            return next();
          }
          self.whereDeep(join.child, join.criteria.where, function(err, where) {
            if (err) {
              next(err);
            }
            if (where) {
              self._criteria.joins[index].criteria.where = where;
            }
            next();
          });
        }, function(err) {
          if (err) {
            return next(err);
          }
          next();
        });
      }], function(err) {
      if (err) {
        return cb(err);
      }
      execute();
    });
  } else {
    self.whereDeep(self._context.identity, queryWhere, function(err, where) {
      if (err) {
        return cb(err);
      }
      if (self._criteria && where) {
        self._criteria.where = where;
      }
      execute();
    });
  }
};


Deferred.prototype.execDeep = function(cb, cursor) {
  var self = this;
  // if this is the first layer (path root)
  if (!cursor) {
    cb = normalize.callback(cb);

    if (this._criteria.joins) {
      var currentPathRef = this._criteria.paths[this._context.identity];
      for (var i in this._criteria.joins) {
        var join = this._criteria.joins[i];
        if (!currentPathRef.children[join.alias] || !currentPathRef.children[join.alias].primaryKey) {
          var collections = this._context.offshore.collections;
          var childAttr = collections[this._context.identity].attributes[join.alias];
          var childCollection = childAttr.collection || childAttr.model;
          currentPathRef.children[join.alias] = {
            collectionName: childCollection,
            primaryKey: _.find(_.keys(collections[childCollection].attributes), function(attr) {
              return collections[childCollection].attributes[attr].primaryKey;
            })
          };
        }
      }
    }
    var deferred = new Deferred(this._context, this._method, this._criteria);
    deferred.exec(function(err, res) {
      if (err) {
        return cb(err);
      }
      if (_.isUndefined(res)) {
        return cb(err, res);
      }
      var data = [];
      if (_.isArray(res)) {
        res.forEach(function(r) {
          data.push(r.toRawData());
        });

      } else {
        data = res.toRawData();
      }
      cursor = new DeepCursor(self._context.identity, data, self._criteria.paths);
      self.execDeep(cb, cursor);
    });

  } else {

    var previousChildren = self._criteria.paths[cursor.path].children;

    async.each(_.keys(previousChildren), function(alias, next) {

      var currentPath = cursor.path + '.' + alias;
      var currentModel = previousChildren[alias].collectionName;
      var currentPk = previousChildren[alias].primaryKey;

      if (!self._criteria.paths[currentPath]) {
        return next();
      }
      var joins = self._criteria.paths[currentPath].joins;
      if (!joins.length) {
        return next();
      }

      var pathCursor = cursor.getChildPath(currentPath);
      var where = {};
      where[currentPk] = _.uniq(pathCursor.getParents());
      var criteria = {where: where, joins: joins};

      var collections = self._context.offshore.collections;
      var deferred = new Deferred(collections[currentModel]._loadQuery(self._context._query), require('./finders/basic').find, criteria);
      deferred.exec(function(err, newLevel) {
        if (err) {
          return next(err);
        }
        var data = [];
        if (_.isArray(newLevel)) {
          newLevel.forEach(function(r) {
            data.push(r.toRawData());
          });
        } else {
          data = newLevel.toRawData();
        }
        pathCursor.zip(data);
        self.execDeep(next, pathCursor);
      });

    }, function(err) {
      if (err) {
        return cb(err);
      }
      return cb(null, cursor.getRoot());
    });
  }
};


/**
 * Executes a Query, and returns a promise
 */

Deferred.prototype.toPromise = function() {
  if (!this._deferred) {
    this._deferred = Promise.promisify(this.exec).bind(this)();
  }
  return this._deferred;
};

/**
 * Executes a Query, and returns a promise that applies cb/ec to the
 * result/error.
 */

Deferred.prototype.then = function(cb, ec) {
  return this.toPromise().then(cb, ec);
};

/**
 * Applies results to function fn.apply, and returns a promise
 */

Deferred.prototype.spread = function(cb) {
  return this.toPromise().spread(cb);
};

/**
 * returns a promise and gets resolved with error
 */

Deferred.prototype.catch = function(cb) {
  return this.toPromise().catch(cb);
};


/**
 * Alias "catch" as "fail"
 */
Deferred.prototype.fail = Deferred.prototype.catch;

/**
 * Build An Aggregate Criteria Option
 *
 * @param {String} key
 * @api private
 */

function buildAggregate(key, args) {

  // If passed in a list, set that as the min criteria
  if (args[0] instanceof Array) {
    args = args[0];
  }

  this._criteria[key] = args || {};
}
