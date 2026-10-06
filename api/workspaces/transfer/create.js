const workspacesHandler = require('../../workspaces');

module.exports = (req, res) => {
  return workspacesHandler(req, res);
};
