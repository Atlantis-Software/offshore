/**
 * Module dependencies
 */

var _ = require('lodash');
var async = require('async');
var normalize = require('../../../utils/normalize');
var hasOwnProperty = require('../../../utils/helpers').object.hasOwnProperty;


////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////

/**
 * NOTICE:
 *
 * This module is not currently being used.
 * Instead, a development-only solution is implemented in `ddl.js.`
 * Auto-migrations for production, that carefully backup data,
 * would be a great addition in the future, but must be carefully
 * evaluated, and probably should not be part of this core Offshore
 * module.
 */

////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////


/**
 * alter
 *
 * Default definition of `alter` functionality in an adapter.
 * Compare physical (original) attributes with specified new schema,
 * and change the physical layer accordingly.
 */

module.exports = function(cb) {

  // The collection we're working with
  var collectionID = this.collection;

  // Normalize Arguments
  cb = normalize.callback(cb);

  // Remove hasMany association keys before sending down to adapter
  var schema = _.clone(this.query._schema.schema) || {};
  Object.keys(schema).forEach(function(key) {
    if (schema[key].type) return;
    delete schema[key];
  });


  var query = this._query || {};
  var connName = this.connection;
  // check default connection
  if (connName === 'default' && query.defaultConnection) {
    connName = query.defaultConnection;
  }
  var connection = this.query.offshore.connections[connName];
  // check connection
  if (!connection) {
    return cb(new Error('No valid connection specified'));
  }
  var adapter = connection._adapter;

  // Check if the adapter defines an alter method, if so
  // go ahead and use that, passing down the new schema.
  if (hasOwnProperty(adapter, 'alter')) {
    return adapter.alter(connName, collectionID, schema, cb);
  }


  // Check if an addAttribute and removeAttribute adapter method are defined
  if (!hasOwnProperty(adapter, 'addAttribute') || !hasOwnProperty(adapter, 'removeAttribute')) {
    return cb();
    // return cb(new Error('Both addAttribute() and removeAttribute() methods are required to use alter()'));
  }

  this.describe(function afterDescribe(err, originalAttributes) {
    if (err) return cb(err);

    // Iterate through each attribute in the new definition
    // Used for keeping track of previously undefined attributes
    // when updating the data stored at the physical layer.
    var newAttributes = _.reduce(schema, function checkAttribute(newAttributes, attribute, attrName) {
      if (!originalAttributes[attrName]) {
        newAttributes[attrName] = attribute;
      }
      return newAttributes;
    }, {});


    // Iterate through physical columns in the database
    // Used for keeping track of no-longer-existent attributes.
    // These must be removed from the physical (original) database.
    var deprecatedAttributes = _.reduce(originalAttributes, function(deprecatedAttributes, attribute, attrName) {
      if (!schema[attrName]) {
        deprecatedAttributes[attrName] = attribute;
      }
      return deprecatedAttributes;
    }, {});


    // Iterate through physical columns in the database
    // Used for keeping track of attributes which are now different
    // than their physical layer equivalents.
    var diff = _.reduce(originalAttributes, function(diff, attribute, attrName) {

      // Bail out if the attribute is no longer in the app-level schema
      if (!schema[attrName]) { return diff; }

      // var hasChanged = _.diff(schema[attrName], originalAttributes[attrName]);
      var hasChanged = false;


      //
      // TODO:
      // implement this!  (note: it's not particularly easy)
      //
      // Probably not something that should be done in core.
      //

      console.log('\n\n*************    ' + collectionID + '.' + attrName + '    ****************');
      console.log('new: ', schema[attrName]);
      console.log('orig: ', originalAttributes[attrName]);
      if (hasChanged) {
        diff[attrName] = schema[attrName];
      }
      return diff;
    }, {});


    async.auto({
      newAttributes: function(done_newAttributes) {
        async.eachSeries(_.keys(newAttributes), function(attrName, nextAttr_) {
          var attrDef = newAttributes[attrName];
          adapter.addAttribute(AdderConnection, collectionID, attrName, attrDef, nextAttr_);
        }, done_newAttributes);
      },
      deprecatedAttributes: function(done_deprecatedAttributes) {
        async.eachSeries(_.keys(deprecatedAttributes), function(attrName, nextAttr_) {
          adapter.removeAttribute(RemoverConnection, collectionID, attrName, nextAttr_);
        }, done_deprecatedAttributes);
      },
      modifiedAttributes: function(done_modifiedAttributes) {
        done_modifiedAttributes();
      }
    }, cb);


    //
    // Should we update the data belonging to this attribute to reflect the new properties?
    // Realistically, this will mainly be about constraints, and primarily uniquness.
    // It'd be good if offshore could enforce all constraints at this time,
    // but there's a trade-off with destroying people's data
    // TODO: Figure this out
    //

  });

};
