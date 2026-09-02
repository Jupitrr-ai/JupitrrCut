import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { ImageBackground, StyleSheet } from 'react-native';

/* eslint-disable @typescript-eslint/no-require-imports -- static asset */
/**
 * One 18×18pt period cropped straight out of the supplied artwork, so the dots are the exact
 * pixels from the reference rather than a re-drawing of them. Cropping a whole period is what
 * makes it repeat without a seam; the @2x/@3x siblings redraw the same geometry at density so
 * the dot stays a crisp square instead of a blurred upscale.
 *
 * React Native has no CSS `background-image`, so the web version of this (a repeating
 * radial-gradient) has to become a tiled image. The tile is opaque and carries the paper
 * colour (#F9F9F8, dots #E3E1E0) — nothing needs to sit behind it.
 */
const DOT_TILE = require('../../../assets/images/dot-tile.png');
/* eslint-enable @typescript-eslint/no-require-imports */

/** Same value baked into the tile — see DottedBackground doc comment. */
const PAPER = '#F9F9F8';
 
 

interface Props {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  className?: string;
  /** Corner radius, applied to the tile too so it does not square off a rounded card. */
  radius?: number;
}

/** Dotted paper backdrop. `backgroundColor` matches the tile so the screen never flashes a
 *  different colour before the asset decodes. */
export function DottedBackground({ children, style, className, radius = 0 }: Props) {
  return (
    <ImageBackground
      source={DOT_TILE}
      resizeMode="repeat"
      className={className}
      style={[styles.fill, { borderRadius: radius }, style]}
      imageStyle={[styles.tile, { borderRadius: radius }]}
    >
      {children}
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  fill: { backgroundColor: PAPER },
  /* The tile is drawn edge to edge; without this the image inherits the container's radius
     handling and can hairline-crop the last row of dots. */
  tile: { resizeMode: 'repeat' },
});
