var Offshore = require('../../../../lib/offshore'),
    assert = require('assert'),
    async = require('async');

describe('Collection Query', function() {

  describe('many to many through association', function() {
    var Drive;

    before(function(done) {

      var offshore = new Offshore();
      var collections = {};

      collections.user = Offshore.Collection.extend({
        identity: 'user',
        connection: 'foo',
        attributes: {
          id: {
            type: 'integer',
            primaryKey: true
          },
          cars: {
            collection: 'car',
            through: 'drive',
            via: 'car'
          }
        }
      });

      collections.drive = Offshore.Collection.extend({
        identity: 'drive',
        connection: 'foo',
        attributes: {
          id: {
            type: 'integer',
            primaryKey: true
          },
          car: {
            model: 'car'
          },
          user: {
            model: 'user'
          }
        }
      });

      collections.car = Offshore.Collection.extend({
        identity: 'car',
        connection: 'foo',
        attributes: {
          id: {
            type: 'integer',
            primaryKey: true
          },
          drivers: {
            collection: 'user',
            via: 'cars',
            dominant: true
          }
        }
      });

      offshore.loadCollection(collections.user);
      offshore.loadCollection(collections.drive);
      offshore.loadCollection(collections.car);

      var connections = {
        'foo': {
          adapter: 'adapter'
        }
      };

      offshore.initialize({adapters: {adapter: require('offshore-memory')}, connections: connections }, function(err, colls) {
        if(err) done(err);
        User = colls.collections.user;
        Drive = colls.collections.drive;
        Car = colls.collections.car;
        async.series([
          function (callback) {
            User.create({id: 1}, callback);
          },
          function (callback) {
            Drive.create({id: 1, car: 1, user: 1}, callback);
          },
          function (callback) {
            Car.create({id: 1}, callback);
          }
        ],function(err) {
          done();
        });
      });
    });


    it('through table model associations should return a single objet', function(done) {
      Drive.findOne(1)
      .populate('car')
      .populate('user')
      .exec(function(err, drive) {
        if(err) return done(err);
	assert(!Array.isArray(drive.car),"through table model associations return Array instead of single Objet");
        assert(!Array.isArray(drive.user),"through table model associations return Array instead of single Objet");
        done();
      });
    });

  });
});
