const fs = require('fs');
const path = require('path');
const { withDangerousMod } = require('@expo/config-plugins');

// R8 (release/minified builds) strips classes that are only reached through
// JNI/reflection, which breaks react-native-webrtc at runtime. Keep the
// affected class so the release APK builds and runs.
const KEEP_RULES = `
# react-native-webrtc / libwebrtc classes reached via JNI (R8 minification fix)
-dontwarn org.webrtc.**
-keep class org.webrtc.** { *; }
-dontwarn org.jitsi.**
-keep class org.jitsi.** { *; }
`;

module.exports = function withProguardKeepRules(config) {
  return withDangerousMod(config, [
    'android',
    async (config) => {
      const projectRoot = config.modRequest.projectRoot;
      const rulesPath = path.join(projectRoot, 'android', 'app', 'proguard-rules.pro');
      let contents = '';
      try {
        contents = fs.readFileSync(rulesPath, 'utf8');
      } catch {
        contents = '';
      }
      if (!contents.includes('react-native-webrtc / libwebrtc')) {
        fs.writeFileSync(rulesPath, `${contents.trimEnd()}\n${KEEP_RULES.trim()}\n`);
      }
      return config;
    },
  ]);
};