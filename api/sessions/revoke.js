const sessionHandler = require('../sessions');

module.exports = (req, res) => {
  return sessionHandler(req, res);
};
