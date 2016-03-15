var Offshore = require('../../../lib/offshore');
var assert = require('assert');
var async = require('async');

var offshore = new Offshore();
var migrate = 'drop';

describe('Criterias Valdiation', function() {
  var AnimalModel, PersonModel, CloverModel;
  before(function(done) {

    var Person = Offshore.Collection.extend({
      identity: 'Person',
      connection: 'assoc_criterias',
      tableName: 'person_table',
      migrate: migrate,
      attributes: {
        "personId": {
          "type": "integer",
          "primaryKey": true
        },
        "personName": {
          "type": "string"
        },
        sheeps: {
          "collection": "Animal",
          "via": "person",
          criteria: {
            where: {legsNumber: 4},
            legsNumber: 4// default value
          }
        }
      }
    });

    var Animal = Offshore.Collection.extend({
      identity: 'Animal',
      connection: 'assoc_criterias',
      tableName: 'animal_table',
      migrate: migrate,
      attributes: {
        "animalId": {
          "type": "integer",
          "primaryKey": true
        },
        "animalColor": {
          "type": "string"
        },
        "legsNumber": {
          "type": "integer"
        },
        person: {
          "model": "person"
        },
        animalAge: {
          "type": "integer"
        }
      }
    });


    var Clover = Offshore.Collection.extend({
      identity: 'Clover',
      connection: 'assoc_criterias',
      tableName: 'clover_table',
      migrate: migrate,
      criteria: {
        where: {"leafNumber": 3},
        leafNumber: 3 // default value
      },
      attributes: {
        "cloverId": {
          "type": "integer",
          "primaryKey": true
        },
        "cloverName": {
          "type": "string"
        },
        leafNumber: {
          "type": "integer"
        }
      }
    });

    offshore.loadCollection(Animal);
    offshore.loadCollection(Person);
    offshore.loadCollection(Clover);

    var connections = {'assoc_criterias': {
        adapter: 'adapter'}
    };

    offshore.initialize({adapters: {adapter: require('offshore-memory')}, connections: connections}, function(err, colls) {
      if (err)
        return done(err);
      PersonModel = colls.collections.person;
      AnimalModel = colls.collections.animal;
      CloverModel = colls.collections.clover;
      done();
    });
  });

  it('should validate child record against association defined criteria', function(done) {
    var marySheeps = [
      {animalId: 1, animalColor: 'Black', legsNumber: 4, animalAge: 2},
      {animalId: 2, animalColor: 'Cyan', legsNumber: 3, animalAge: 1}
    ];

    PersonModel.create({personId: 1, personName: 'Mary', sheeps: marySheeps}, function(err) {
      assert(err, 'An error should be returned');
      assert(err[0].values.legsNumber === 3, 'Error should contains the non valid child record');
      done();
    });
  });

  it('should validate record against model defined criteria', function(done) {
    CloverModel.create({cloverId: 1, clovertName: 'clover', leafNumber: 4}).exec(function(err) {
      assert(err, 'An error should be returned');
      done();
    });
  });

  it('should populate with children respecting association criteria and `.populate()` criteria', function(done) {
    var sheeps = [
      {animalId: 5, animalColor: 'Black', legsNumber: 3, animalAge: 0, person: 3},
      {animalId: 6, animalColor: 'Cyan', legsNumber: 4, animalAge: 2, person: 3},
      {animalId: 7, animalColor: 'Black', legsNumber: 4, animalAge: 1, person: 3}
    ];

    AnimalModel.createEach(sheeps, function(err) {
      if (err)
        return done(err);
      PersonModel.create({personId: 3, personName: 'Samir'}).exec(function(err) {
        if (err)
          return done(err);
        PersonModel.findOne(3).populate('sheeps', {where: {animalColor: 'Black', animalAge: {'<': 2}}})
          .exec(function(err, person) {
            if (err)
              return done(err);
            assert(person.sheeps.length === 1, 'Found children should respect the merged criterias');
            assert(person.sheeps[0].animalColor === 'Black' && person.sheeps[0].animalAge === 1 && person.sheeps[0].legsNumber === 4,
              'Found children should respect the merged criterias');
            done();
          });
      });
    });
  });

  it('should add default value specified in model criteria to attribute if resolved to undefined', function(done) {
    CloverModel.create({cloverId: 2, clovertName: 'clover with default value'}).exec(function(err) {
      assert(!err, 'Validation should succeed');
      done();
    });
  });

  it('should add default value specified in association criteria to attribute if resolved to undefined', function(done) {
    var sheeps = [
      {animalId: 8, animalColor: 'Red', animalAge: 2},
      {animalId: 9, animalColor: 'Blue', animalAge: 3}
    ];

    PersonModel.create({personId: 4, personName: 'Jacques', sheeps: sheeps}, function(err) {
      assert(!err, 'Validation should succeed');
      done();
    });
  });

});