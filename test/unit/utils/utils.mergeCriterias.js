var _ = require('lodash');
var assert = require('assert');
var mergeCriterias = require('../../../lib/offshore/utils/mergeCriterias');

describe('Criterias', function() {
  describe('Where Clause', function() {
    var source = {where: {
        like: {attr1: 'val1', attr2: 'val2'},
        or: [{attr3: 1}, {attr4: 2}],
        contains: {attr5: 'con'},
        array: [1, 2, 3],
        attr6: {like: '%val6%'},
        number: {'>': 0},
        attr7: 'val7'
      }
    };
    var destination = {where: {
        like: {attr2: 'val22', attr3: 'val3'},
        or: [{attr3: 3}, {attr10: 4}],
        array: [4, 5],
        attr6: {like: '%val66%'},
        number: {'<': 10},
        attr7: 'val10'
      }
    };
    it('should be merged', function(done) {
      var criteria = mergeCriterias(destination, source);
      assert(criteria.where.like.attr1 === 'val1', 'key should be conserved if not exists in destination');
      assert(criteria.where.like.attr2 === 'val22', 'key should be overriden if exists in destination');
      assert(criteria.where.like.attr3 === 'val3', 'key should be added if not exists in source');
      assert(criteria.where.or[0].attr3 === 3 && criteria.where.or[1].attr10 === 4, 'or should be overriden if exists in destination');
      assert(criteria.where.array[0] === 4 && criteria.where.array[1] === 5, 'array should be overriden if exists in destination');
      assert(criteria.where.attr6.like === '%val66%', 'inner like should be overriden');
      assert(criteria.where.number['<'] === 10 && criteria.where.number['>'] === 0, 'number comparations should be merged');
      assert(criteria.where.attr7 = 'val10', 'atributes should be overriden if specified in destination');
      assert(criteria.where.contains, 'atributes should be conserved if not specified in destination');
      done();
    });
  });
  describe('Sort Clause', function() {
    var source = {sort: {key1: 'asc', key2: 'asc'}};
    var destination = {sort: {key3: 'desc', key2: 'desc'}};
    it('should be merged', function(done) {
      var criteria = mergeCriterias(destination, source);
      assert(criteria.sort.key1 === 'asc', 'should conserve sort keys if not specified in destination');
      assert(criteria.sort.key2 === 'desc', 'should override sort keys if specified in destination');
      assert(criteria.sort.key3 === 'desc', 'should add new sort keys specified in destination');
      assert(_.last(_.keys(criteria.sort)) === 'key1', 'default sort keys should have low priority in merged criteria');
      done();
    });

  });

  it('should override select and groupBy clauses', function(done) {
    var source = {select: ['key1', 'key2'], groupBy: ['group1']};
    var destination = {select: ['key3', 'key4'], groupBy: ['group2']};
    var criteria = mergeCriterias(destination, source);
    assert(criteria.select[0] === 'key3' && criteria.select[1] === 'key4' && criteria.groupBy[0] === 'group2');
    done();
  });

  it('should overide limit and skip', function(done) {
    var source = {limit: 1, skip: 1};
    var destination = {limit: 2, skip: 2};
    var criteria = mergeCriterias(destination, source);
    assert(criteria.limit === 2 && criteria.skip === 2);
    done();
  });
});