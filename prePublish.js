// your-pre-publish-script.js
const packageVersion = require('./package.json').version;

if (packageVersion.includes('-beta')) {
  console.log('Publishing beta version to GitHub Packages');
  process.env.npm_config_registry = 'https://npm.pkg.github.com/';
} else {
  throw "not prepublish to npm";
}