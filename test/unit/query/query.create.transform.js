var Offshore = require('../../../lib/offshore'),
    assert = require('assert');

describe('Collection Query', function() {

  describe('.create()', function() {

    describe('with transformed values', function() {
      var Model;

      before(function() {

        Model = Offshore.Collection.extend({
          identity: 'user',
          connection: 'foo',

          attributes: {
            name: {
              type: 'string',
              columnName: 'login'
            }
          }
        });
      });

      it('should transform values before sending to adapter', function(done) {

        var offshore = new Offshore();
        offshore.loadCollection(Model);

        // Fixture Adapter Def
        var adapterDef = {
          create: function(con, col, values, cb) {
            assert(values.login);
            return cb(null, values);
          }
        };

        var connections = {
          'foo': {
            adapter: 'foobar'
          }
        };

        offshore.initialize({ adapters: { foobar: adapterDef }, connections: connections }, function(err, colls) {
          if(err) return done(err);
          colls.collections.user.create({ name: 'foo' }, done);
        });

      });

      it('should transform values after receiving from adapter', function(done) {

        var offshore = new Offshore();
        offshore.loadCollection(Model);

        // Fixture Adapter Def
        var adapterDef = {
          create: function(con, col, values, cb) {
            assert(values.login);
            return cb(null, values);
          }
        };

        var connections = {
          'foo': {
            adapter: 'foobar'
          }
        };

        offshore.initialize({ adapters: { foobar: adapterDef }, connections: connections }, function(err, colls) {
          if(err) return done(err);
          colls.collections.user.create({ name: 'foo' }, function(err, values) {
            assert(values.name);
            assert(!values.login);
            done();
          });
        });
      });
    });

  });
});
