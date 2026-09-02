package expo.modules.videoexport.beauty

/**
 * A normalized ellipse in shader UV coordinates ([0,1] with origin at bottom-left).
 *
 * `halfWidth` / `halfHeight` are the semi-axes (so the ellipse covers
 * `[centerX - halfWidth, centerX + halfWidth]` × `[centerY - halfHeight, centerY + halfHeight]`).
 *
 * Empty / unused slots use 0 for both half axes so the shader can skip them cheaply.
 */
internal data class NormalizedEllipse(
  val centerX: Float,
  val centerY: Float,
  val halfWidth: Float,
  val halfHeight: Float,
) {
  companion object {
    val EMPTY = NormalizedEllipse(0f, 0f, 0f, 0f)
  }
}

/**
 * One face detected in a single sampled frame, with optional feature regions
 * (eyes, mouth) that should be excluded from smoothing.
 */
internal data class DetectedFace(
  val face: NormalizedEllipse,
  val leftEye: NormalizedEllipse,
  val rightEye: NormalizedEllipse,
  val mouth: NormalizedEllipse,
)

/**
 * The set of faces detected at a given presentation timestamp during the pre-pass.
 * The shader picks the closest frame in time when rendering.
 */
internal data class FaceFrame(
  val presentationTimeUs: Long,
  val faces: List<DetectedFace>,
)
