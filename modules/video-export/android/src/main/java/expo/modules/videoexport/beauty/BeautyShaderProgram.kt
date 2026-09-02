package expo.modules.videoexport.beauty

import android.opengl.GLES20
import androidx.media3.common.VideoFrameProcessingException
import androidx.media3.common.util.GlProgram
import androidx.media3.common.util.GlUtil
import androidx.media3.common.util.Size
import androidx.media3.common.util.UnstableApi
import androidx.media3.effect.BaseGlShaderProgram

/**
 * Custom shader program that smooths skin only inside face regions, mirroring the iOS
 * Core Image pipeline:
 *  1. White ellipse per detected face (slightly expanded to cover forehead).
 *  2. Black ellipse cutouts at the eyes and mouth so those features stay sharp.
 *  3. 3×3 widened box blur applied only where the resulting mask is > 0.
 *
 * Face data for the entire video is computed up-front by [FaceDetectionService]; per-frame
 * lookup is a binary search over presentation timestamps (very cheap).
 */
@UnstableApi
internal class BeautyShaderProgram(
  private val intensity: Float,
  private val faceFrames: List<FaceFrame>,
) : BaseGlShaderProgram(
  /* useHighPrecisionColorComponents = */ false,
  /* texturePoolCapacity = */ 1,
) {

  private val glProgram: GlProgram = GlProgram(VERTEX_SHADER, FRAGMENT_SHADER)
  private var texelSize = floatArrayOf(1f / 1280f, 1f / 720f)

  // Scratch arrays reused per frame to avoid allocations in the render loop.
  private val faceUniform = FloatArray(MAX_FACES * 4)
  private val leftEyeUniform = FloatArray(MAX_FACES * 4)
  private val rightEyeUniform = FloatArray(MAX_FACES * 4)
  private val mouthUniform = FloatArray(MAX_FACES * 4)

  init {
    glProgram.setBufferAttribute(
      "aFramePosition",
      GlUtil.getNormalizedCoordinateBounds(),
      GlUtil.HOMOGENEOUS_COORDINATE_VECTOR_SIZE,
    )
  }

  override fun configure(inputWidth: Int, inputHeight: Int): Size {
    texelSize = floatArrayOf(1f / inputWidth.toFloat(), 1f / inputHeight.toFloat())
    return Size(inputWidth, inputHeight)
  }

  override fun drawFrame(inputTexId: Int, presentationTimeUs: Long) {
    val faces = lookupFaces(presentationTimeUs)
    val count = packFaceUniforms(faces)

    var phase = "init"
    try {
      phase = "use"; glProgram.use()
      phase = "sampler"; glProgram.setSamplerTexIdUniform("uTexSampler", inputTexId, /* texUnitIndex = */ 0)
      phase = "intensity"; glProgram.setFloatUniform("uIntensity", intensity)
      phase = "texelSize"; glProgram.setFloatsUniform("uTexelSize", texelSize)
      phase = "faceCount"; glProgram.setIntUniform("uFaceCount", count)

      // Face uniforms are unrolled in the shader (4 slots each) — we always upload all
      // 4 slots regardless of count, with unused slots zeroed by packFaceUniforms.
      phase = "uFace0"; glProgram.setFloatsUniform("uFace0", slice(faceUniform, 0))
      phase = "uFace1"; glProgram.setFloatsUniform("uFace1", slice(faceUniform, 1))
      phase = "uFace2"; glProgram.setFloatsUniform("uFace2", slice(faceUniform, 2))
      phase = "uFace3"; glProgram.setFloatsUniform("uFace3", slice(faceUniform, 3))
      phase = "uLeftEye0"; glProgram.setFloatsUniform("uLeftEye0", slice(leftEyeUniform, 0))
      phase = "uLeftEye1"; glProgram.setFloatsUniform("uLeftEye1", slice(leftEyeUniform, 1))
      phase = "uLeftEye2"; glProgram.setFloatsUniform("uLeftEye2", slice(leftEyeUniform, 2))
      phase = "uLeftEye3"; glProgram.setFloatsUniform("uLeftEye3", slice(leftEyeUniform, 3))
      phase = "uRightEye0"; glProgram.setFloatsUniform("uRightEye0", slice(rightEyeUniform, 0))
      phase = "uRightEye1"; glProgram.setFloatsUniform("uRightEye1", slice(rightEyeUniform, 1))
      phase = "uRightEye2"; glProgram.setFloatsUniform("uRightEye2", slice(rightEyeUniform, 2))
      phase = "uRightEye3"; glProgram.setFloatsUniform("uRightEye3", slice(rightEyeUniform, 3))
      phase = "uMouth0"; glProgram.setFloatsUniform("uMouth0", slice(mouthUniform, 0))
      phase = "uMouth1"; glProgram.setFloatsUniform("uMouth1", slice(mouthUniform, 1))
      phase = "uMouth2"; glProgram.setFloatsUniform("uMouth2", slice(mouthUniform, 2))
      phase = "uMouth3"; glProgram.setFloatsUniform("uMouth3", slice(mouthUniform, 3))

      phase = "bind"; glProgram.bindAttributesAndUniforms()
      phase = "draw"; GLES20.glDrawArrays(GLES20.GL_TRIANGLE_STRIP, /* first = */ 0, /* count = */ 4)
    } catch (e: Throwable) {
      // Catch every kind of failure here (GlException, IllegalArgumentException for missing
      // uniforms, RuntimeException, anything) so the surfaced message tells us EXACTLY which
      // step blew up. Media3 1.8.0 doesn't expose a (Throwable, presentationTimeUs) ctor on
      // VideoFrameProcessingException, so we embed the timestamp + phase in the message.
      throw VideoFrameProcessingException(
        "Beauty draw failed at phase=$phase pts=${presentationTimeUs}us faces=$count: " +
          "${e.javaClass.simpleName}: ${e.message}",
        e
      )
    }
  }

  // 16 dedicated scratch slices (4 facial features × 4 face slots) — we can't share one
  // buffer because GlProgram.setFloatsUniform stores the reference and reads it later
  // during bindAttributesAndUniforms(); a shared buffer would make every uniform see only
  // the last value written.
  private val sliceScratches = Array(16) { FloatArray(4) }

  /** Copies a single 4-float ellipse slot into a dedicated per-slot scratch array. */
  private fun slice(src: FloatArray, slot: Int): FloatArray {
    val scratchIndex = sliceIndex(src, slot)
    val dst = sliceScratches[scratchIndex]
    val base = slot * 4
    dst[0] = src[base]
    dst[1] = src[base + 1]
    dst[2] = src[base + 2]
    dst[3] = src[base + 3]
    return dst
  }

  /** Maps (source array identity, slot) → an index in [0, 16). */
  private fun sliceIndex(src: FloatArray, slot: Int): Int {
    val group = when (src) {
      faceUniform -> 0
      leftEyeUniform -> 1
      rightEyeUniform -> 2
      mouthUniform -> 3
      else -> error("Unknown uniform array")
    }
    return group * 4 + slot
  }

  override fun release() {
    super.release()
    try {
      glProgram.delete()
    } catch (e: GlUtil.GlException) {
      throw VideoFrameProcessingException("Beauty program release failed", e)
    }
  }

  /**
   * Nearest-in-time lookup over the pre-computed face frames. Binary search keeps this
   * O(log N) per output frame, even for long videos with many samples.
   */
  private fun lookupFaces(presentationTimeUs: Long): List<DetectedFace> {
    if (faceFrames.isEmpty()) return emptyList()

    var lo = 0
    var hi = faceFrames.size - 1
    while (lo < hi) {
      val mid = (lo + hi) ushr 1
      if (faceFrames[mid].presentationTimeUs < presentationTimeUs) {
        lo = mid + 1
      } else {
        hi = mid
      }
    }

    val candidate = faceFrames[lo]
    if (lo == 0) return candidate.faces
    val prev = faceFrames[lo - 1]
    val candidateDelta = candidate.presentationTimeUs - presentationTimeUs
    val prevDelta = presentationTimeUs - prev.presentationTimeUs
    return if (prevDelta <= candidateDelta) prev.faces else candidate.faces
  }

  /**
   * Packs up to [MAX_FACES] ellipses into the float arrays the shader expects.
   * Unused slots are zeroed so the shader can skip them via the count check.
   */
  private fun packFaceUniforms(faces: List<DetectedFace>): Int {
    val count = faces.size.coerceAtMost(MAX_FACES)
    for (i in 0 until count) {
      val f = faces[i]
      writeEllipse(faceUniform, i, f.face)
      writeEllipse(leftEyeUniform, i, f.leftEye)
      writeEllipse(rightEyeUniform, i, f.rightEye)
      writeEllipse(mouthUniform, i, f.mouth)
    }
    for (i in count until MAX_FACES) {
      writeEllipse(faceUniform, i, NormalizedEllipse.EMPTY)
      writeEllipse(leftEyeUniform, i, NormalizedEllipse.EMPTY)
      writeEllipse(rightEyeUniform, i, NormalizedEllipse.EMPTY)
      writeEllipse(mouthUniform, i, NormalizedEllipse.EMPTY)
    }
    return count
  }

  private fun writeEllipse(dst: FloatArray, slot: Int, e: NormalizedEllipse) {
    val base = slot * 4
    dst[base] = e.centerX
    dst[base + 1] = e.centerY
    dst[base + 2] = e.halfWidth
    dst[base + 3] = e.halfHeight
  }

  companion object {
    private const val MAX_FACES = 4

    // Standard pass-through vertex shader. aFramePosition arrives in [-1, 1] clip space
    // (4-component homogeneous coords); we derive UV by remapping to [0, 1].
    private val VERTEX_SHADER = """
      #version 100
      attribute vec4 aFramePosition;
      varying vec2 vTexCoord;
      void main() {
        gl_Position = aFramePosition;
        vTexCoord = vec2(aFramePosition.x * 0.5 + 0.5, aFramePosition.y * 0.5 + 0.5);
      }
    """.trimIndent()

    // Fragment shader builds a face mask, carves out features, applies an edge-preserving
    // BILATERAL filter (NOT a Gaussian), and blends only inside the mask.
    //
    // Why bilateral instead of Gaussian:
    //  A straight Gaussian blur smears EVERY pixel equally, so even with a face mask the
    //  inside of the face goes uniformly soft — eyelashes, nose contour, lip edges all
    //  fade out. Users perceive this as "added a blur filter", not "smoothed my skin".
    //
    //  Bilateral weights each tap by BOTH spatial distance AND color similarity to the
    //  center pixel. Skin tone has small color variations across pores/blemishes → those
    //  taps get full weight and average together (smoothing). Edges (eye → skin, lip →
    //  skin, hair → skin) have large color differences → those taps get near-zero weight
    //  and are excluded from the average (edge preservation).
    //
    //  This is the GLSL analog of iOS's `CIMedianFilter` + `CIGaussianBlur` pipeline: it
    //  kills pore/blemish texture without losing sharp facial features.
    //
    // Design notes:
    //  - All ellipses are (cx, cy, halfW, halfH) in shader UV ([0,1], bottom-left origin).
    //    Empty slots have halfW or halfH ~= 0; ellipseInside/Outside short-circuit those.
    //  - 5x5 kernel with stride BLUR_STRIDE in texels gives effective radius ~(2*stride)
    //    pixels. With BLUR_STRIDE=4 that's ~8 px at 1080p (matches iOS ~7.9 px).
    //  - mix formula tuned DOWN from the previous 0.55..0.90 to 0.30..0.65. Bilateral
    //    smoothing is much more "honest" than Gaussian — full mix would look porcelain.
    //  - 25 samples/pixel is heavy in absolute terms but trivial for offline transcoding.
    //
    // Why individual uniforms instead of vec4 arrays:
    //  Some mobile GPU drivers (notably older Adreno and Mali variants) miscompile GLES 2.0
    //  shaders that dynamically index uniform arrays (`uFaces[i]` with a loop variable),
    //  occasionally throwing GL_INVALID_OPERATION at draw time and surfacing to Media3 as
    //  the generic "Video frame processing error". We unroll the 4-face loop into
    //  individual uniforms (uFace0..uFace3 etc.) which all drivers handle uniformly.
    //  Cost is just 12 extra vec4 uniforms — still far under the GLES 2.0 minimum count.
    private val FRAGMENT_SHADER = """
      #version 100
      precision mediump float;

      uniform sampler2D uTexSampler;
      uniform vec2 uTexelSize;
      uniform float uIntensity;
      uniform int uFaceCount;

      uniform vec4 uFace0;
      uniform vec4 uFace1;
      uniform vec4 uFace2;
      uniform vec4 uFace3;
      uniform vec4 uLeftEye0;
      uniform vec4 uLeftEye1;
      uniform vec4 uLeftEye2;
      uniform vec4 uLeftEye3;
      uniform vec4 uRightEye0;
      uniform vec4 uRightEye1;
      uniform vec4 uRightEye2;
      uniform vec4 uRightEye3;
      uniform vec4 uMouth0;
      uniform vec4 uMouth1;
      uniform vec4 uMouth2;
      uniform vec4 uMouth3;

      varying vec2 vTexCoord;

      const float BLUR_STRIDE = 4.0;
      // Spatial-kernel sigma=1.4 → falloff exponent = 1/(2 * 1.4^2) = 0.255.
      const float SPATIAL_FALLOFF = 0.255;
      // Range-kernel sigma=0.10 in normalized RGB → 1/(2*0.10^2) = 50.
      // Smaller divisor = more edge preservation; larger = closer to a plain Gaussian.
      // 50 keeps eyes/mouth/hair contours razor-sharp while still averaging skin pores.
      const float RANGE_FALLOFF = 50.0;

      float ellipseInside(vec2 uv, vec4 e) {
        if (e.z < 0.001 || e.w < 0.001) return 0.0;
        vec2 d = (uv - e.xy) / vec2(e.z, e.w);
        return 1.0 - smoothstep(0.85, 1.15, length(d));
      }

      float ellipseOutside(vec2 uv, vec4 e) {
        if (e.z < 0.001 || e.w < 0.001) return 1.0;
        vec2 d = (uv - e.xy) / vec2(e.z, e.w);
        return smoothstep(0.75, 1.15, length(d));
      }

      float faceMask(vec2 uv, vec4 face, vec4 le, vec4 re, vec4 mo) {
        float m = ellipseInside(uv, face);
        m *= ellipseOutside(uv, le);
        m *= ellipseOutside(uv, re);
        m *= ellipseOutside(uv, mo);
        return m;
      }

      void main() {
        vec3 src = texture2D(uTexSampler, vTexCoord).rgb;
        float mask = 0.0;

        if (uFaceCount >= 1) mask = max(mask, faceMask(vTexCoord, uFace0, uLeftEye0, uRightEye0, uMouth0));
        if (uFaceCount >= 2) mask = max(mask, faceMask(vTexCoord, uFace1, uLeftEye1, uRightEye1, uMouth1));
        if (uFaceCount >= 3) mask = max(mask, faceMask(vTexCoord, uFace2, uLeftEye2, uRightEye2, uMouth2));
        if (uFaceCount >= 4) mask = max(mask, faceMask(vTexCoord, uFace3, uLeftEye3, uRightEye3, uMouth3));

        // Tuned DOWN from 0.55..0.90: bilateral is edge-preserving and feels much heavier
        // than its mix factor suggests because skin texture truly gets averaged out.
        // 0.30..0.65 lands at a natural "polished" look at default intensity 0.7.
        float mixStrength = 0.30 + 0.35 * uIntensity;
        mask *= mixStrength;

        if (mask < 0.005) {
          gl_FragColor = vec4(src, 1.0);
          return;
        }

        // --- Bilateral filter ---
        vec3 smoothed = src;       // start with the center pixel (weight = 1 implicitly)
        float totalW = 1.0;
        for (int x = -2; x <= 2; x++) {
          for (int y = -2; y <= 2; y++) {
            if (x == 0 && y == 0) continue;
            vec2 off = vec2(float(x), float(y)) * uTexelSize * BLUR_STRIDE;
            vec3 s = texture2D(uTexSampler, vTexCoord + off).rgb;

            float spatialW = exp(-float(x * x + y * y) * SPATIAL_FALLOFF);
            vec3 dc = s - src;
            float colorDist2 = dot(dc, dc);
            float rangeW = exp(-colorDist2 * RANGE_FALLOFF);

            float w = spatialW * rangeW;
            smoothed += s * w;
            totalW += w;
          }
        }
        smoothed /= totalW;

        gl_FragColor = vec4(mix(src, smoothed, mask), 1.0);
      }
    """.trimIndent()
  }
}
