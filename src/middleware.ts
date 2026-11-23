// Next.js only loads middleware from the project root when there is no
// `src` directory. This app uses `src/app`, so the real middleware lives
// in the root file and is re-exported here to make Next actually run it.
export { middleware, config } from '../middleware';
