const fs = require('fs');
const path = require('path');
const { withProjectBuildGradle } = require('@expo/config-plugins');

function getAndroidGradlePluginVersion(projectRoot) {
  const versionsPath = path.join(
    projectRoot,
    'node_modules',
    'react-native',
    'gradle',
    'libs.versions.toml',
  );

  try {
    const versions = fs.readFileSync(versionsPath, 'utf8');
    const match = versions.match(/^agp\s*=\s*"([^"]+)"/m);
    if (match) return match[1];
  } catch {
    // Fall through to the minimum supported by the Jitsi SDK.
  }

  return '8.4.2';
}

module.exports = function withJitsiGradlePluginVersion(config) {
  return withProjectBuildGradle(config, (config) => {
    if (config.modResults.language !== 'groovy') return config;

    const version = getAndroidGradlePluginVersion(config.modRequest.projectRoot);
    const assignment = `rootProject.ext.gradlePluginVersion = '${version}'`;
    const contents = config.modResults.contents;

    if (!contents.includes('rootProject.ext.gradlePluginVersion')) {
      config.modResults.contents = `${contents.trimEnd()}\n\n// Jitsi React Native SDK reads this value while configuring its Android module.\n${assignment}\n`;
    }

    return config;
  });
};
