var Validator = require('../../../lib/offshore/core/validations'),
    assert = require('assert');

describe('validations', function() {

  describe('types', function() {
    var validator;

    before(function() {

      var validations = {
        name: { type: 'string' },
        age: { type: 'integer' }
      };

      validator = new Validator();
      validator.initialize(validations);
    });

    it('should validate string type', function(done) {
      validator.validate({ name: 'foo bar' }, function (err, validationErrors) {
        if (err) { return done(err); }
        assert(!validationErrors);
        done();
      });
    });

    it('should validate integer type', function(done) {
      validator.validate({ age: 27 }, function (err, validationErrors) {
        if (err) { return done(err); }
        assert(!validationErrors);
        done();
      });
    });

    it('should error if string passed to integer type', function(done) {
      validator.validate({ age: 'foo bar' }, function (err, validationErrors) {
        if (err) { return done(err); }
        assert(validationErrors);
        assert(validationErrors.age);
        done();
      });
    });

  });

});
