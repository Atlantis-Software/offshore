var _ = require('lodash');

var merge = module.exports = function(destination, source) {
  if (source) {
    var userCriteria = _.cloneDeep(destination);
    destination = _.merge({}, source, userCriteria);
    // merging  the sort with _.defaults(), to ensure that userCriteria sort keys have more priority in order, and they should override same keys in the default sort
    destination.sort = _.defaults({}, userCriteria.sort, source.sort);
    // override "or" clause
    if (userCriteria.where && userCriteria.where.or) {
      destination.where.or = userCriteria.where.or;
    }
    else if (!userCriteria.where) {
      destination.where = source.where;
    }
    // overriding select
    if (userCriteria.select) {
      destination.select = userCriteria.select;
    }
    return destination;
  }
  return destination;
};