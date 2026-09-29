const { requireRoles } = require('./access');
module.exports = function authRole(allowedRoles) {
  return requireRoles(allowedRoles);
};
