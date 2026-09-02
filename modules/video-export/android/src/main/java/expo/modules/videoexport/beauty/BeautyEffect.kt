package expo.modules.videoexport.beauty

import android.content.Context
import androidx.media3.common.util.UnstableApi
import androidx.media3.effect.GlEffect
import androidx.media3.effect.GlShaderProgram

/**
 * Media3 [GlEffect] that applies face-masked skin smoothing.
 *
 * Construction is cheap — the actual GL program is created when the Transformer
 * spins up its frame processor and calls [toGlShaderProgram].
 */
@UnstableApi
internal class BeautyEffect(
  private val intensity: Float,
  private val faceFrames: List<FaceFrame>,
) : GlEffect {
  override fun toGlShaderProgram(context: Context, useHdr: Boolean): GlShaderProgram {
    return BeautyShaderProgram(intensity, faceFrames)
  }
}
