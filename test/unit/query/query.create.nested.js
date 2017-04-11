var Offshore = require('../../../lib/offshore'),
    assert = require('assert');

describe('Collection Query', function() {

  describe('.create()', function() {

    describe('with nested model values', function() {
      var query;

      before(function(done) {

        var offshore = new Offshore();
        var Model = Offshore.Collection.extend({
          identity: 'user',
          connection: 'foo',
          attributes: {
            name: {
              type: 'string',
              defaultsTo: 'Foo Bar'
            },
            nestedModel: {
              model: 'nested'
            }
          }
        });
        var Nested = Offshore.Collection.extend({
          identity: 'nested',
          connection: 'foo',
          attributes: {
            name: 'string'
          }
        });

        offshore.loadCollection(Model);
        offshore.loadCollection(Nested);

        // Fixture Adapter Def
        var _id = 1;
        var findValues = [];

        var adapterDef = {
          create: function(con, col, values, cb) {
            values.id = _id;
            findValues.push(values);
            _id++;
            return cb(null, values);
          },
          find: function(con, col, criteria, cb) {
            cb(null, findValues[_id - 1]);
          }
        };

        var connections = {
          'foo': {
            adapter: 'foobar'
          }
        };

        offshore.initialize({ adapters: { foobar: adapterDef }, connections: connections }, function(err, colls) {
          if(err) return done(err);
          query = colls.collections.user;
          done();
        });
      });

      it('should reduce the nested object down to a foreign key', function(done) {
        query.create({ name: 'foo', nestedModel: { name: 'joe' }}, function(err, status) {
          assert(!err);
          assert(status.nestedModel);
          assert(status.nestedModel.id ==== 1);
          assert(status.nestedModel.name === 'joe');
          done();
        });
      });
    });

    describe('with nested collection values', function() {
      var query, updatedModels = [], findValues = [];

      before(function(done) {

        var offshore = new Offshore();
        var Model = Offshore.Collection.extend({
          identity: 'user',
          connection: 'foo',
          attributes: {
            name: {
              type: 'string',
              defaultsTo: 'Foo Bar'
            },
            nestedModels: {
              collection: 'nested',
              via: 'model'
            }
          }
        });
        var Nested = Offshore.Collection.extend({
          identity: 'nested',
          connection: 'foo',
          attributes: {
            name: 'string',
            model: {
              model: 'user'
            }
          }
        });

        offshore.loadCollection(Model);
        offshore.loadCollection(Nested);

        var _id = 1;
        var adapterDef = {
          create: function(con, col, values, cb) {
            values.id = _id;
            findValues.push(values);
            _id++;
            return cb(null, values);
          },
          find: function(con, col, criteria, cb) {
            cb(null, findValues[_id - 1]);
          },
          update: function(con, col, criteria, values, cb) {
            updatedModels.push(criteria.where);
            return cb(null, [values]);
          }
        };

        var connections = {
          'foo': {
            adapter: 'foobar'
          }
        };

        offshore.initialize({ adapters: { foobar: adapterDef }, connections: connections }, function(err, colls) {
          if(err) return done(err);
          query = colls.collections.user;
          done();
        });
      });

      it('should attempt to update each nested model', function(done) {

        var nestedModels = [
          { name: 'joe', model: 2 },
          { name: 'moe', model: 3 },
          { name: 'flow', model: 4 }
        ];

        query.create({ id: 5, name: 'foo', nestedModels: nestedModels }, function(err, status) {
          assert(!err);
          assert(status.nestedModels.length === 3);
          assert(findValues.length === 4);
          done();
        });
      });
    });

  });
});
