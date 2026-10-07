import { createRequire } from 'node:module'

// Root package.json is "type": "module"; server/ is CommonJS.
const require = createRequire(import.meta.url)
const app = require('../server/index.js')

export default app
