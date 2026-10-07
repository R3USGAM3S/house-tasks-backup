// Catch-all so /api/tasks etc. hit Express (root package.json is ESM)
module.exports = require('../server/index.js')
