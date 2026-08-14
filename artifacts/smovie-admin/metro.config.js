const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// Firebase publishes packages that resolve one another from their package
// directories. Keep Metro aware of both the app-local and workspace-level
// pnpm dependency trees so those internal imports work in the web bundle.
const workspaceRoot = path.resolve(__dirname, '../..');
config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(__dirname, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// Block Metro from watching temporary native module directories created by
// expo config plugins at startup (they may not be fully set up yet).
config.resolver.blockList = [
  /.*_tmp_\d+.*/,
];

module.exports = config;
