/**
 * Module Dependencies
 */
var async = require('async');
var _ = require('lodash');

/**
 * Queue up operations on a model instance for any nested association
 * values in a .create() query.
 *
 * @param {Object} parentModel
 * @param {Object} associations
 * @param {Function} cb
 * @api private
 */

module.exports = function(parentModel, collections, cb) {
  var self = this;
  var parentName = self.identity;
  var parentSchema = self.offshore.schema[parentName];
  var parentPk = _.findKey(parentSchema.attributes, { primaryKey: true });

  var parentPkValue = parentModel[parentPk];

  // Create operations
  var operations = [];
  _.forEach(collections, function(childs, associationName) {
    childs = _.isArray(childs) ? childs : [childs];
    _.forEach(childs, function(childValue) {
      var association = parentSchema.attributes[associationName];
      var joinSchema = self.offshore.schema[association.references];
      var operation = {
        associationName: associationName,
        parentPkValue: parentPkValue
      };
      // With a junction table
      if (joinSchema.junctionTable) {
        var childAttribute = _.find(joinSchema.attributes, function(attribute) {
          return (attribute.references && attribute.references !== parentName);
        });

        var childPk = _.findKey(self.offshore.schema[childAttribute.references].attributes, { primaryKey: true });

        operation.junction = {
            collection: self.offshore.collections[association.references],
            parentKey: association.onKey,
            childKey: _.findKey(joinSchema.attributes, function(attribute) {
              return (attribute.references && attribute.references !== parentName);
            })
        };
        operation.child = {
          collection: self.offshore.collections[childAttribute.references],
          value: childValue,
          pk: childPk
        };
      // With a through table
      } else if (joinSchema.throughTable) {
        var childAttribute = _.find(joinSchema.attributes, function(attribute) {
          return (attribute.references && attribute.references !== parentName);
        });

        var childPk = _.findKey(self.offshore.schema[childAttribute.references].attributes, { primaryKey: true });

        operation.junction = {
            collection: self.offshore.collections[association.references],
            parentKey: association.onKey,
            childKey: joinSchema.throughTable[parentName + '.' + associationName]
        };
        operation.child = {
          collection: self.offshore.collections[childAttribute.references],
          value: childValue,
          pk: childPk
        }
      // Without junction table
      } else {
        var childPk = _.findKey(self.offshore.schema[association.references].attributes, { primaryKey: true });
        operation.child = {
          collection: self.offshore.collections[association.references],
          value: childValue,
          pk: childPk,
          fk: association.onKey
        }
      }
      operations.push(operation);
    });
  });

  var populateChild = function(operation, cb) {
    parentModel[operation.associationName] = parentModel[operation.associationName] || [];
    if (_.isObject(operation.child.value)) {
      parentModel[operation.associationName].push(operation.child.value);
      cb();
    } else {
      operation.child.collection._loadQuery(self._query).findOne(operation.child.value, function(err, child) {
        if(err) {
          return cb(err);
        }
        parentModel[operation.associationName].push(child);
        cb();
      });
    }
  };

  var createJunction = function(operation, cb) {
    var junction = {};
    junction[operation.junction.parentKey] = operation.parentPkValue;
    junction[operation.junction.childKey] = operation.child.value;
    if (_.isObject(operation.child.value)) {
      junction[operation.junction.childKey] = operation.child.value[operation.child.pk];
    }
    operation.junction.collection._loadQuery(self._query).create(junction, cb);
  }

  // Execute all operations
  async.eachLimit(operations, 10, function(operation, callback) {
    // With a junction table
    if (operation.junction) {
      // With a child object
      if(_.isObject(operation.child.value)) {
        operation.child.collection._loadQuery(self._query).create(operation.child.value, function(err, child) {
          if(err) {
            return callback(err);
          }
          operation.child.value[operation.child.pk] = child[operation.child.pk];
          createJunction(operation, function(err) {
            if(err) {
              return callback(err);
            }
            populateChild(operation, callback);
          });
        });
      // With only a foreign key
      } else {
        createJunction(operation, function(err) {
          if(err) {
            return callback(err);
          }
          populateChild(operation, callback);
        });
      }
    // Without a junction table
    } else {
      // With a child object
      if(_.isObject(operation.child.value)) {
        operation.child.value[operation.child.fk] = operation.parentPkValue;
        operation.child.collection._loadQuery(self._query).create(operation.child.value, function(err, child) {
          if(err) {
            return callback(err);
          }
          operation.child.value[operation.child.pk] = child[operation.child.pk];
          populateChild(operation, callback);
        });
      // With only a foreign key
      } else {
        // update child model
        var update = {};
        update[operation.child.fk] = operation.parentPkValue;
        operation.child.collection._loadQuery(self._query).update(operation.child.value, update, function(err, child) {
          if(err) {
            return callback(err);
          }
          operation.child.value = child;
          populateChild(operation, callback);
        });
      }
    }
  }, function(err) {
    if (err) {
      return cb(err);
    }
    cb(null, parentModel);
  });
};
