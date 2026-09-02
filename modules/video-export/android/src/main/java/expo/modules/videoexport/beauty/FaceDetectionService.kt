package expo.modules.videoexport.beauty

import android.graphics.Bitmap
import android.media.MediaMetadataRetriever
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.face.FaceDetection
import com.google.mlkit.vision.face.FaceDetectorOptions
import com.google.mlkit.vision.face.FaceLandmark
import com.google.android.gms.tasks.Tasks
import java.io.File
import java.util.concurrent.TimeUnit
import kotlin.math.max

/**
 * Runs a pre-pass over the source video to locate faces + feature landmarks at fixed
 * intervals. The result feeds into [BeautyEffect] so the GL shader can mask the smoothing
 * pass to facial skin only — same idea as the iOS Vision-based path.
 *
 * Implementation notes:
 *  - Sampling rate is intentionally low (~6 fps) because faces don't move much between
 *    frames and per-frame detection in the GL pipeline is impractical. The shader uses
 *    nearest-in-time lookup; the feathered edges hide the discretization.
 *  - MediaMetadataRetriever returns bitmaps in DISPLAY orientation (rotation applied),
 *    which matches what Media3 Transformer feeds to custom effects.
 *  - Eye / mouth landmarks are POINTS (not regions) in ML Kit; we synthesize ellipses
 *    sized as a fraction of the face bbox so the shader's carve-outs cover the actual
 *    feature with some padding.
 */
internal class FaceDetectionService {

  companion object {
    /** Longest-side pixel cap for bitmaps fed to ML Kit. Detection quality is unchanged
     *  at this size for face-sized subjects and memory cost drops by 5-25x for HD/4K. */
    private const val MAX_DETECTION_DIM = 640
  }

  /**
   * @param videoPath absolute file path
   * @param samplesPerSecond how many frames per second to sample for face detection.
   *   Higher = smoother mask updates but slower pre-pass.
   * @param perFrameTimeoutMs hard cap per frame so a single bad bitmap can't hang us.
   */
  fun detect(
    videoPath: String,
    samplesPerSecond: Float = 6f,
    perFrameTimeoutMs: Long = 1500L,
  ): List<FaceFrame> {
    require(File(videoPath).exists()) { "File not found: $videoPath" }

    val retriever = MediaMetadataRetriever()
    val detector = FaceDetection.getClient(
      FaceDetectorOptions.Builder()
        .setPerformanceMode(FaceDetectorOptions.PERFORMANCE_MODE_FAST)
        .setLandmarkMode(FaceDetectorOptions.LANDMARK_MODE_ALL)
        .setClassificationMode(FaceDetectorOptions.CLASSIFICATION_MODE_NONE)
        // 0.15 = ignore faces smaller than ~15% of frame width. Skip tiny background
        // faces to keep the mask focused on the main subject.
        .setMinFaceSize(0.15f)
        .build()
    )

    return try {
      retriever.setDataSource(videoPath)
      val durationMs = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)
        ?.toLongOrNull() ?: 0L
      if (durationMs <= 0L) {
        println("⚠️ [FaceDetection] Could not read duration from $videoPath")
        return emptyList()
      }

      val stepUs = (1_000_000L / samplesPerSecond.coerceAtLeast(0.5f)).toLong()
      val durationUs = durationMs * 1000L
      val frames = mutableListOf<FaceFrame>()
      var samplesAttempted = 0
      var samplesWithBitmap = 0
      var samplesWithFaces = 0
      var lastError: Throwable? = null

      var timeUs = 0L
      while (timeUs <= durationUs) {
        samplesAttempted++
        val raw = retriever.getFrameAtTime(
          timeUs,
          MediaMetadataRetriever.OPTION_CLOSEST_SYNC
        )
        if (raw != null) {
          samplesWithBitmap++
          // Downscale the bitmap before handing it to ML Kit. Detection accuracy is
          // unchanged at ~640px, but memory + detection time drop substantially. Critical
          // for 4K source video where each full-res bitmap is ~33 MB and we'd otherwise
          // hold up to a sample-rate-second's worth simultaneously while the GC catches up.
          val detect = downscaleForDetection(raw, MAX_DETECTION_DIM)
          val faces = runCatching {
            detectFaces(detector, detect, perFrameTimeoutMs)
          }.getOrElse { err ->
            lastError = err
            emptyList()
          }

          if (faces.isNotEmpty()) {
            samplesWithFaces++
            frames.add(FaceFrame(presentationTimeUs = timeUs, faces = faces))
          }
          // createScaledBitmap may return the input when no scaling is needed; only
          // recycle each underlying Bitmap once.
          if (detect !== raw) {
            detect.recycle()
          }
          raw.recycle()
        }
        timeUs += stepUs
      }

      println(
        "🔍 [FaceDetection] duration=${durationMs}ms samples=$samplesAttempted " +
          "bitmaps=$samplesWithBitmap withFaces=$samplesWithFaces" +
          (lastError?.let { " lastError=${it.javaClass.simpleName}: ${it.message}" } ?: "")
      )

      frames
    } finally {
      runCatching { retriever.release() }
      runCatching { detector.close() }
    }
  }

  private fun detectFaces(
    detector: com.google.mlkit.vision.face.FaceDetector,
    bitmap: Bitmap,
    timeoutMs: Long,
  ): List<DetectedFace> {
    val input = InputImage.fromBitmap(bitmap, /* rotationDegrees = */ 0)
    val mlFaces = Tasks.await(detector.process(input), timeoutMs, TimeUnit.MILLISECONDS)
    if (mlFaces.isNullOrEmpty()) return emptyList()

    val bitmapWidth = bitmap.width.toFloat().coerceAtLeast(1f)
    val bitmapHeight = bitmap.height.toFloat().coerceAtLeast(1f)

    return mlFaces.mapNotNull { face ->
      val bbox = face.boundingBox
      if (bbox.width() <= 0 || bbox.height() <= 0) return@mapNotNull null

      val faceEllipse = bitmapRectToEllipse(
        centerXpx = bbox.exactCenterX(),
        centerYpx = bbox.exactCenterY(),
        widthPx = bbox.width().toFloat(),
        heightPx = bbox.height().toFloat(),
        bitmapWidth = bitmapWidth,
        bitmapHeight = bitmapHeight,
      )

      // ML Kit returns landmark POINTS (no extent). Synthesize ellipses scaled to the face
      // bbox so the shader's carve-outs reliably cover the feature plus a small margin.
      // These ratios are tuned to match the iOS Vision-derived sizes.
      val eyeWPx = bbox.width() * 0.20f
      val eyeHPx = bbox.height() * 0.10f
      val mouthWPx = bbox.width() * 0.45f
      val mouthHPx = bbox.height() * 0.13f

      fun pointToEllipse(landmarkType: Int, wPx: Float, hPx: Float): NormalizedEllipse {
        val landmark = face.getLandmark(landmarkType) ?: return NormalizedEllipse.EMPTY
        val p = landmark.position
        return bitmapRectToEllipse(
          centerXpx = p.x,
          centerYpx = p.y,
          widthPx = wPx,
          heightPx = hPx,
          bitmapWidth = bitmapWidth,
          bitmapHeight = bitmapHeight,
        )
      }

      val leftEye = pointToEllipse(FaceLandmark.LEFT_EYE, eyeWPx, eyeHPx)
      val rightEye = pointToEllipse(FaceLandmark.RIGHT_EYE, eyeWPx, eyeHPx)

      // Mouth is best derived from the two mouth corners + bottom landmark for a
      // tighter fit, falling back to MOUTH_BOTTOM alone if corners are missing.
      val mouth = computeMouthEllipse(
        face,
        fallbackHalfW = mouthWPx / 2f,
        fallbackHalfH = mouthHPx / 2f,
        bitmapWidth = bitmapWidth,
        bitmapHeight = bitmapHeight,
      )

      DetectedFace(
        face = faceEllipse,
        leftEye = leftEye,
        rightEye = rightEye,
        mouth = mouth,
      )
    }
  }

  /**
   * Builds an ellipse from a pixel-space rect on a top-left-origin bitmap and converts it
   * to shader UV space (bottom-left origin, [0,1]).
   */
  private fun bitmapRectToEllipse(
    centerXpx: Float,
    centerYpx: Float,
    widthPx: Float,
    heightPx: Float,
    bitmapWidth: Float,
    bitmapHeight: Float,
  ): NormalizedEllipse {
    val cx = centerXpx / bitmapWidth
    // Flip Y: ML Kit / bitmaps use top-left origin; shader UV has origin at bottom-left.
    val cy = 1f - (centerYpx / bitmapHeight)
    val halfW = (widthPx / bitmapWidth) * 0.5f
    val halfH = (heightPx / bitmapHeight) * 0.5f
    return NormalizedEllipse(cx, cy, halfW.coerceAtLeast(0f), halfH.coerceAtLeast(0f))
  }

  /**
   * Returns either the input bitmap (if already small enough) or a downscaled copy whose
   * longer side equals [maxDim]. Caller must check `result !== input` to know whether to
   * recycle the returned bitmap separately.
   */
  private fun downscaleForDetection(bitmap: Bitmap, maxDim: Int): Bitmap {
    val longSide = max(bitmap.width, bitmap.height)
    if (longSide <= maxDim) return bitmap
    val scale = maxDim.toFloat() / longSide.toFloat()
    val newWidth = max(1, (bitmap.width * scale).toInt())
    val newHeight = max(1, (bitmap.height * scale).toInt())
    return Bitmap.createScaledBitmap(bitmap, newWidth, newHeight, /* filter = */ true)
  }

  private fun computeMouthEllipse(
    face: com.google.mlkit.vision.face.Face,
    fallbackHalfW: Float,
    fallbackHalfH: Float,
    bitmapWidth: Float,
    bitmapHeight: Float,
  ): NormalizedEllipse {
    val left = face.getLandmark(FaceLandmark.MOUTH_LEFT)?.position
    val right = face.getLandmark(FaceLandmark.MOUTH_RIGHT)?.position
    val bottom = face.getLandmark(FaceLandmark.MOUTH_BOTTOM)?.position

    return when {
      left != null && right != null && bottom != null -> {
        val width = kotlin.math.abs(right.x - left.x) * 1.25f
        val midX = (left.x + right.x) / 2f
        val midY = (left.y + right.y) / 2f
        val height = kotlin.math.abs(bottom.y - midY) * 2.2f
        bitmapRectToEllipse(midX, midY, width, height, bitmapWidth, bitmapHeight)
      }
      bottom != null -> bitmapRectToEllipse(
        bottom.x,
        bottom.y,
        fallbackHalfW * 2f,
        fallbackHalfH * 2f,
        bitmapWidth,
        bitmapHeight,
      )
      else -> NormalizedEllipse.EMPTY
    }
  }
}
