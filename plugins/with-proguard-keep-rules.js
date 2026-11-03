const fs = require('fs');
const path = require('path');
const { withDangerousMod } = require('@expo/config-plugins');

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

      // 1. Append keep/dontwarn rules to proguard-rules.pro
      const rulesPath = path.join(projectRoot, 'android', 'app', 'proguard-rules.pro');
      let contents = '';
      try {
        contents = fs.readFileSync(rulesPath, 'utf8');
      } catch {
        contents = '';
      }
      if (!contents.includes('react-native-webrtc / libwebrtc classes reached via JNI')) {
        fs.writeFileSync(rulesPath, `${contents.trimEnd()}\n${KEEP_RULES.trim()}\n`);
      }

      // 2. Disable R8 minification for release builds. Even with keep rules,
      // minification has been crashing the release APK on startup; turning it
      // off makes the preview build behave like a debug build (larger but
      // stable) which is what we need for a demo.
      const gradlePropsPath = path.join(projectRoot, 'android', 'gradle.properties');
      let props = '';
      try {
        props = fs.readFileSync(gradlePropsPath, 'utf8');
      } catch {
        props = '';
      }
      if (!props.includes('android.enableMinifyInReleaseBuilds=false')) {
        props = props.replace(/android\.enableMinifyInReleaseBuilds\s*=\s*true/, 'android.enableMinifyInReleaseBuilds=false');
        if (!/android\.enableMinifyInReleaseBuilds/.test(props)) {
          props = `${props.trimEnd()}\nandroid.enableMinifyInReleaseBuilds=false\n`;
        }
        fs.writeFileSync(gradlePropsPath, props);
      }

      return config;
    },
  ]);
};