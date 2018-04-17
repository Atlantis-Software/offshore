var Offshore = require('../../../lib/offshore'),
    assert = require('assert');

describe('Offshore', function() {

  describe('loader', function() {
    var offshore;

    before(function() {
      offshore = new Offshore();
    });


    it('should keep an internal mapping of collection definitions', function() {
      var collection = Offshore.Collection.extend({ foo: 'bar' });
      var collections = offshore.loadCollection(collection);

      assert(Array.isArray(collections));
      assert(collections.length === 1);
    });
  });


  describe('initialize', function() {

    describe('without junction tables', function() {
      var offshore;

      before(function() {
        offshore = new Offshore();

        // Setup Fixture Model
        var collection = Offshore.Collection.extend({
          tableName: 'foo',
          connection: 'my_foo',
          attributes: {
            foo: 'string'
          }
        });

        offshore.loadCollection(collection);
      });


      it('should return an array of initialized collections', function(done) {

        var connections = {
          'my_foo': {
            adapter: 'foo'
          }
        };

        offshore.initialize({ adapters: { foo: {} }, connections: connections }, function(err, data) {
          if(err) return done(err);

          assert(data.collections);
          assert(Object.keys(data.collections).length === 1);
          assert(data.collections.foo);
          done();
        });
      });
    });


    describe('with junction tables', function() {
      var offshore;

      before(function() {
        offshore = new Offshore();

        // Setup Fixture Models
        var foo = Offshore.Collection.extend({
          tableName: 'foo',
          connection: 'my_foo',
          attributes: {
            bar: {
              collection: 'bar',
              via: 'foo',
              dominant: true
            }
          }
        });

        var bar = Offshore.Collection.extend({
          tableName: 'bar',
          connection: 'my_foo',
          attributes: {
            foo: {
              collection: 'foo',
              via: 'bar'
            }
          }
        });

        offshore.loadCollection(foo);
        offshore.loadCollection(bar);
      });


      it('should add the junction tables to the collection output', function(done) {

        var connections = {
          'my_foo': {
            adapter: 'foo'
          }
        };

        offshore.initialize({ adapters: { foo: {} }, connections: connections }, function(err, data) {
          if(err) return done(err);

          assert(data.collections);
          assert(Object.keys(data.collections).length === 3);
          assert(data.collections.foo);
          assert(data.collections.bar);
          assert(data.collections.bar_foo__foo_bar);

          done();
        });
      });
    });

  });
});
