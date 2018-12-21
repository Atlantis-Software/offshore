var Offshore = require('../../../../lib/offshore'),
    Schema = require('offshore-schema'),
    Transformer = require('../../../../lib/offshore/core/transformations'),
    assert = require('assert');

describe('Core Transformations', function() {

  describe('serialize', function() {

    describe('with normal key/value pairs', function() {
      var transformer;

      before(function() {
        var attributes = {
          name: 'string',
          username: {
            columnName: 'login'
          }
        };

        transformer = new Transformer(attributes, {});
      });

      it('should change username key to login', function() {
        var values = transformer.serialize({ username: 'foo' });
        assert(values.login);
        assert(values.login === 'foo');
      });

      it('should work recursively', function() {
        var values = transformer.serialize({ where: { user: { username: 'foo' }}});
        assert(values.where.user.login);
        assert(values.where.user.login === 'foo');
      });

      it('should work on SELECT queries', function() {
        var values = transformer.serialize(
          {
            where: {
              username: 'foo'
            },
            select: ['username']
          }
        );

        assert(values.where.login);
        assert.equal(values.select.indexOf('login'),  0);
      });
    });

    describe('with associations', function() {
      var colls = {};

      /**
       * Build up real offshore schema for accurate testing
       */

      before(function() {
        var collections = [],
            offshore = new Offshore();

        collections.push(Offshore.Collection.extend({
          identity: 'customer',
          tableName: 'customer',
          attributes: {
            uuid: {
              type: 'string',
              primaryKey: true
            },
            foo: {
              collection: 'foo',
              via: 'customer'
            }
          }
        }));

        collections.push(Offshore.Collection.extend({
          identity: 'foo',
          tableName: 'foo',
          attributes: {
            customer: {
              model: 'customer',
              columnName: 'customer_uuid'
            },
            bar: {
              model: 'bar',
              columnName: 'foobar_id'
            }
          }
        }));

        collections.push(Offshore.Collection.extend({
          identity: 'bar',
          tableName: 'bar',
          attributes: {
            id: {
              type: 'integer',
              primaryKey: true,
              columnName: 'bar_id'
            },
            name: {
              type: 'string',
              columnName: 'bar_name'
            }
          }
        }));

        var schema = new Schema(collections);
        colls.foo = {
          _transformer: new Transformer(schema.foo.attributes, colls)
        };
        colls.customer = {
          _transformer: new Transformer(schema.customer.attributes, colls)
        };
        colls.bar = {
          _transformer: new Transformer(schema.bar.attributes, colls)
        };
      });

      it('should change customer key to customer_uuid', function() {
        var values = colls.foo._transformer.serialize({ customer: 1 });
        assert(values.customer_uuid);
        assert(values.customer_uuid === 1);
      });

      it('should work recursively', function() {
        var values = colls.foo._transformer.serialize({ where: { user: { customer: 1 }}});
        assert(values.where.user.customer_uuid);
        assert(values.where.user.customer_uuid === 1);
      });

      it('should work deeply', function() {
        var values = colls.customer._transformer.serialize({
          where: {
            foo: {
              and: [
                { bar: [1, 2] },
                { bar: { name: 'a' }}
              ]
            }
          },
          sort: { 'foo.bar.name': -1 }
        });
        assert.deepEqual(values.where.foo.and, [
          { foobar_id: [1, 2] },
          { bar: { bar_name: 'a' } }
        ]);
        assert(values.sort['foo.bar.bar_name']);
        assert.equal(values.sort['foo.bar.bar_name'], -1);
      });

    });
  });

});
