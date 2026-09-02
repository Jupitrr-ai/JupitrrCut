const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * Re-injects `:modular_headers => true` for the Firebase/Google Swift-pod dependencies
 * `GoogleUtilities` and `RecaptchaInterop`.
 *
 * Why a config plugin (not a manual Podfile edit): the Swift pod `AppCheckCore` imports those
 * two pods, which don't define modules, so `pod install` fails to integrate them as static
 * libraries ("cannot yet be integrated as static libraries"). EAS Build runs `expo prebuild`
 * during the build, which regenerates the Podfile from the template and discards any manual
 * edits — so the fix has to be applied at prebuild time, here.
 *
 * Targeted on purpose (just these two pods) to avoid the wider side effects of a global
 * `use_modular_headers!` / `use_frameworks!` with the New Architecture + Hermes.
 */
const MODULAR_PODS = ['GoogleUtilities', 'RecaptchaInterop'];

module.exports = function withFirebaseModularHeaders(config) {
  return withDangerousMod(config, [
    'ios',
    (cfg) => {
      const podfilePath = path.join(cfg.modRequest.platformProjectRoot, 'Podfile');
      let contents = fs.readFileSync(podfilePath, 'utf8');

      const lines = MODULAR_PODS.filter(
        (pod) => !contents.includes(`pod '${pod}', :modular_headers => true`)
      ).map((pod) => `  pod '${pod}', :modular_headers => true`);

      if (lines.length > 0 && contents.includes('use_expo_modules!')) {
        contents = contents.replace('use_expo_modules!', `use_expo_modules!\n${lines.join('\n')}`);
        fs.writeFileSync(podfilePath, contents);
      }
      return cfg;
    },
  ]);
};
