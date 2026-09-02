import { useEffect, useRef } from 'react';
import { Animated, Easing, Image, View } from 'react-native';

/* eslint-disable @typescript-eslint/no-require-imports -- static assets */
/**
 * Each mark carries its own aspect ratio (width ÷ height of the asset). A fixed-width slot
 * looks even in code but not on screen: these wordmarks range from 1.9:1 to 5.8:1, so a
 * shared slot shrinks the wide ones to nothing and leaves the narrow ones swimming in air.
 * Sizing each by aspect keeps the *gaps* constant instead of the boxes.
 */
const LOGOS = [
  { src: require('../../../assets/images/logos/micrsft.png'), aspect: 281 / 64 },
  { src: require('../../../assets/images/logos/unicef.png'), aspect: 262 / 64 },
  { src: require('../../../assets/images/logos/cisco.png'), aspect: 121 / 64 },
  { src: require('../../../assets/images/logos/bd.png'), aspect: 370 / 64 },
  { src: require('../../../assets/images/logos/gojek.png'), aspect: 245 / 64 },
  { src: require('../../../assets/images/logos/google.png'), aspect: 186 / 64 },
  { src: require('../../../assets/images/logos/zoho.png'), aspect: 149 / 64 },
  { src: require('../../../assets/images/logos/fox.png'), aspect: 149 / 64 },
];
/* eslint-enable @typescript-eslint/no-require-imports */

const LOGO_H = 20;
const GAP = 28;

/** Exact width of one pass, gaps included — the loop resets by precisely this, so the seam
 *  between the last logo and the repeated first one is the same GAP as everywhere else. */
const ROW_W = LOGOS.reduce((total, logo) => total + LOGO_H * logo.aspect + GAP, 0);
const SCROLL_MS = 22000;

/**
 * Endless logo strip. The row is rendered twice and translated by exactly one row width, so
 * the reset lands on an identical frame and the loop is invisible.
 */
export function LogoMarquee() {
  const x = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.timing(x, {
        toValue: -ROW_W,
        duration: SCROLL_MS,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    animation.start();
    return () => animation.stop();
  }, [x]);

  return (
    <View className="overflow-hidden" style={{ height: LOGO_H + 12 }}>
      <Animated.View
        className="flex-row items-center"
        style={{ width: ROW_W * 2, transform: [{ translateX: x }] }}
      >
        {[...LOGOS, ...LOGOS].map((logo, i) => (
          <Image
            key={i}
            source={logo.src}
            style={{
              width: LOGO_H * logo.aspect,
              height: LOGO_H,
              marginRight: GAP,
              opacity: 0.45,
            }}
            resizeMode="contain"
            accessibilityIgnoresInvertColors
          />
        ))}
      </Animated.View>
    </View>
  );
}
