package expo.modules.videoexport

import android.media.MediaCodec
import android.media.MediaExtractor
import android.media.MediaFormat
import android.media.MediaMuxer
import android.net.Uri
import android.os.Handler
import android.os.Looper
import androidx.media3.common.Effect
import androidx.media3.common.MediaItem
import androidx.media3.common.util.UnstableApi
import androidx.media3.effect.GaussianBlur
import androidx.media3.effect.RgbAdjustment
import androidx.media3.transformer.Composition
import androidx.media3.transformer.EditedMediaItem
import androidx.media3.transformer.EditedMediaItemSequence
import androidx.media3.transformer.Effects
import androidx.media3.transformer.ExportException
import androidx.media3.transformer.ExportResult
import androidx.media3.transformer.Transformer
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.videoexport.beauty.BeautyEffect
import expo.modules.videoexport.beauty.FaceDetectionService
import java.io.File
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference
import kotlin.math.*

class VideoExportModule : Module() {
  private data class ValidClip(
    val originalIndex: Int,
    val filePath: String,
    val startUs: Long,
    val endUs: Long?
  )

  private data class TrackWriteResult(
    val samplesWritten: Int,
    val lastOutputOffsetUs: Long,
    val estimatedSampleDurationUs: Long
  ) {
    val timelineDurationUs: Long
      get() = if (samplesWritten > 0) {
        lastOutputOffsetUs + estimatedSampleDurationUs
      } else {
        0L
      }
  }

  override fun definition() = ModuleDefinition {
    Name("VideoExport")

    AsyncFunction("exportVideo") { clips: List<Map<String, Any>>, outputPath: String, settings: Map<String, Any> ->
      performExport(clips, outputPath, settings)
    }

    AsyncFunction("analyzeAudioLevels") { videoUri: String, chunkMs: Double ->
      performAudioAnalysis(videoUri, chunkMs)
    }

    AsyncFunction("beautifyVideo") { videoUri: String, outputPath: String, intensity: Double ->
      performBeautify(videoUri, outputPath, intensity)
    }
  }

  // ---------------------------------------------------------------------------
  // Shared helpers
  // ---------------------------------------------------------------------------

  private fun resolveFilePath(uri: String): String {
    val t = uri.trim()
    return when {
      t.startsWith("http://") || t.startsWith("https://") ->
        throw IllegalArgumentException("Remote URLs not supported: $t")
      t.startsWith("file://") -> t.removePrefix("file://")
      else -> t
    }
  }

  private fun findFirstTrack(extractor: MediaExtractor, mimePrefix: String): Int {
    for (i in 0 until extractor.trackCount) {
      val mime = extractor.getTrackFormat(i).getString(MediaFormat.KEY_MIME) ?: continue
      if (mime.startsWith(mimePrefix)) return i
    }
    return -1
  }

  private fun formatInt(format: MediaFormat, key: String): Int? =
    if (format.containsKey(key)) format.getInteger(key) else null

  private fun areFormatsCompatible(reference: MediaFormat, candidate: MediaFormat, isVideo: Boolean): Boolean {
    val referenceMime = reference.getString(MediaFormat.KEY_MIME)
    val candidateMime = candidate.getString(MediaFormat.KEY_MIME)
    if (referenceMime != candidateMime) return false

    return if (isVideo) {
      formatInt(reference, MediaFormat.KEY_WIDTH) == formatInt(candidate, MediaFormat.KEY_WIDTH) &&
        formatInt(reference, MediaFormat.KEY_HEIGHT) == formatInt(candidate, MediaFormat.KEY_HEIGHT)
    } else {
      formatInt(reference, MediaFormat.KEY_SAMPLE_RATE) == formatInt(candidate, MediaFormat.KEY_SAMPLE_RATE) &&
        formatInt(reference, MediaFormat.KEY_CHANNEL_COUNT) == formatInt(candidate, MediaFormat.KEY_CHANNEL_COUNT)
    }
  }

  private fun findTrackFormat(filePath: String, mimePrefix: String): MediaFormat? {
    val extractor = MediaExtractor()
    return try {
      extractor.setDataSource(filePath)
      val track = findFirstTrack(extractor, mimePrefix)
      if (track >= 0) extractor.getTrackFormat(track) else null
    } finally {
      extractor.release()
    }
  }

  private fun estimatedSampleDurationUs(format: MediaFormat, isVideo: Boolean): Long {
    if (isVideo && format.containsKey(MediaFormat.KEY_FRAME_RATE)) {
      val frameRate = format.getInteger(MediaFormat.KEY_FRAME_RATE)
      if (frameRate > 0) return (1_000_000L / frameRate).coerceAtLeast(1L)
    }
    return if (isVideo) 33_333L else 23_220L
  }

  private fun seekToWriteStart(
    extractor: MediaExtractor,
    startUs: Long,
    endUs: Long?,
    isVideo: Boolean
  ): Long? {
    val seekMode = if (isVideo && startUs > 0L) {
      MediaExtractor.SEEK_TO_NEXT_SYNC
    } else {
      MediaExtractor.SEEK_TO_PREVIOUS_SYNC
    }
    extractor.seekTo(startUs, seekMode)

    while (extractor.sampleTrackIndex >= 0) {
      val sampleUs = extractor.sampleTime
      if (endUs != null && sampleUs > endUs) return null

      val isSyncSample = extractor.sampleFlags and MediaExtractor.SAMPLE_FLAG_SYNC != 0
      if (sampleUs >= startUs && (!isVideo || startUs == 0L || isSyncSample)) {
        return sampleUs
      }

      extractor.advance()
    }

    return null
  }

  private fun writeTrackSamples(
    filePath: String,
    mimePrefix: String,
    muxer: MediaMuxer,
    muxerTrack: Int,
    clipStartUs: Long,
    endUs: Long?,
    compositionUs: Long,
    buffer: ByteBuffer,
    isVideo: Boolean,
    format: MediaFormat
  ): TrackWriteResult {
    val extractor = MediaExtractor()
    val info = MediaCodec.BufferInfo()

    try {
      extractor.setDataSource(filePath)
      val track = findFirstTrack(extractor, mimePrefix)
      if (track < 0) {
        return TrackWriteResult(0, 0L, estimatedSampleDurationUs(format, isVideo))
      }

      extractor.selectTrack(track)
      seekToWriteStart(extractor, clipStartUs, endUs, isVideo)
        ?: return TrackWriteResult(0, 0L, estimatedSampleDurationUs(format, isVideo))

      var samplesWritten = 0
      var previousSourceUs = -1L
      var estimatedDurationUs = estimatedSampleDurationUs(format, isVideo)
      var lastOutputOffsetUs = 0L

      while (extractor.sampleTrackIndex >= 0) {
        val sampleUs = extractor.sampleTime
        if (sampleUs < clipStartUs) {
          extractor.advance()
          continue
        }
        if (endUs != null && sampleUs > endUs) break

        if (isVideo && samplesWritten == 0) {
          val isSyncSample = extractor.sampleFlags and MediaExtractor.SAMPLE_FLAG_SYNC != 0
          if (clipStartUs > 0L && !isSyncSample) {
            extractor.advance()
            continue
          }
        }

        buffer.clear()
        val sampleSize = extractor.readSampleData(buffer, 0)
        if (sampleSize <= 0) break

        if (previousSourceUs >= 0L) {
          val deltaUs = sampleUs - previousSourceUs
          if (deltaUs > 0L) estimatedDurationUs = deltaUs
        }

        lastOutputOffsetUs = (sampleUs - clipStartUs).coerceAtLeast(0L)
        info.set(
          0,
          sampleSize,
          compositionUs + lastOutputOffsetUs,
          extractor.sampleFlags
        )
        muxer.writeSampleData(muxerTrack, buffer, info)

        samplesWritten += 1
        previousSourceUs = sampleUs
        extractor.advance()
      }

      return TrackWriteResult(
        samplesWritten = samplesWritten,
        lastOutputOffsetUs = lastOutputOffsetUs,
        estimatedSampleDurationUs = estimatedDurationUs.coerceAtLeast(1L)
      )
    } finally {
      extractor.release()
    }
  }

  private fun computeRMS(samples: ShortArray): Double {
    if (samples.isEmpty()) return 0.0
    val sum = samples.fold(0.0) { acc, s -> acc + s.toDouble() * s.toDouble() }
    return sqrt(sum / samples.size)
  }

  // ---------------------------------------------------------------------------
  // Audio analysis — decode to PCM, compute RMS per chunk → dB
  // ---------------------------------------------------------------------------

  private fun performAudioAnalysis(videoUri: String, chunkMs: Double): List<Map<String, Double>> {
    val filePath = resolveFilePath(videoUri)
    require(File(filePath).exists()) { "File not found: $filePath" }

    val extractor = MediaExtractor()
    extractor.setDataSource(filePath)

    val audioTrackIdx = findFirstTrack(extractor, "audio/")
    require(audioTrackIdx >= 0) { "No audio track found in: $filePath" }

    val format = extractor.getTrackFormat(audioTrackIdx)
    val mime = format.getString(MediaFormat.KEY_MIME)!!
    val sampleRate = if (format.containsKey(MediaFormat.KEY_SAMPLE_RATE))
      format.getInteger(MediaFormat.KEY_SAMPLE_RATE) else 44100
    val channels = format.getInteger(MediaFormat.KEY_CHANNEL_COUNT).coerceAtLeast(1)

    extractor.selectTrack(audioTrackIdx)

    val decoder = MediaCodec.createDecoderByType(mime)
    decoder.configure(format, null, null, 0)
    decoder.start()

    val samplesPerChunk = (sampleRate * chunkMs / 1000.0).toInt().coerceAtLeast(1)
    val results = mutableListOf<Map<String, Double>>()
    val pending = ArrayDeque<Short>(samplesPerChunk * 2)
    var totalMono = 0L
    var inputDone = false
    var outputDone = false
    val timeoutUs = 10_000L
    val info = MediaCodec.BufferInfo()

    try {
      while (!outputDone) {
        // Feed encoded data into the decoder
        if (!inputDone) {
          val idx = decoder.dequeueInputBuffer(timeoutUs)
          if (idx >= 0) {
            val buf = decoder.getInputBuffer(idx)!!
            val n = extractor.readSampleData(buf, 0)
            if (n < 0) {
              decoder.queueInputBuffer(idx, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM)
              inputDone = true
            } else {
              decoder.queueInputBuffer(idx, 0, n, extractor.sampleTime, 0)
              extractor.advance()
            }
          }
        }

        // Drain decoded PCM output
        val outIdx = decoder.dequeueOutputBuffer(info, timeoutUs)
        if (outIdx >= 0) {
          val outBuf = decoder.getOutputBuffer(outIdx)!!
          outBuf.order(ByteOrder.LITTLE_ENDIAN)
          val shorts = outBuf.asShortBuffer()
          val raw = ShortArray(shorts.remaining()).also { shorts.get(it) }

          // Downmix to mono: average all channels
          var i = 0
          while (i < raw.size) {
            var sum = 0L
            for (ch in 0 until channels) {
              sum += if (i + ch < raw.size) raw[i + ch].toLong() else 0L
            }
            pending.addLast((sum / channels).toShort())
            i += channels
          }

          decoder.releaseOutputBuffer(outIdx, false)

          // Emit complete chunks
          while (pending.size >= samplesPerChunk) {
            val chunk = ShortArray(samplesPerChunk) { pending.removeFirst() }
            val rms = computeRMS(chunk)
            val db = if (rms > 0.0) 20.0 * log10(rms / 32768.0) else -160.0
            val timeMs = totalMono.toDouble() / sampleRate * 1000.0
            results.add(mapOf("timeMs" to timeMs, "volumeDb" to db))
            totalMono += samplesPerChunk
          }

          if (info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0) {
            outputDone = true
          }
        }
      }
    } finally {
      decoder.stop()
      decoder.release()
      extractor.release()
    }

    // Emit remaining tail samples as a final partial chunk
    if (pending.isNotEmpty()) {
      val chunk = ShortArray(pending.size) { pending.removeFirst() }
      val rms = computeRMS(chunk)
      val db = if (rms > 0.0) 20.0 * log10(rms / 32768.0) else -160.0
      val timeMs = totalMono.toDouble() / sampleRate * 1000.0
      results.add(mapOf("timeMs" to timeMs, "volumeDb" to db))
    }

    return results
  }

  // ---------------------------------------------------------------------------
  // Video export / stitching — concatenate clips via MediaMuxer
  // ---------------------------------------------------------------------------

  /**
   * Applies face-masked skin smoothing — feature-parity with the iOS Vision-based pipeline.
   *
   * Flow:
   *  1. Pre-pass: sample the source video at ~6 fps and run ML Kit Face Detection to locate
   *     each face's bounding box + eye/mouth landmarks per timestamp.
   *  2. Transform: Media3 Transformer transcodes the source through a custom [BeautyEffect]
   *     whose GLSL shader builds a feathered ellipse mask per face, carves out eyes & mouth,
   *     blurs the source, and blends only inside the mask.
   *
   * Stability choices:
   *  - Transformer (Media3) handles codec/surface/muxer lifecycle, the source of most bugs in
   *    hand-rolled MediaCodec + OpenGL implementations.
   *  - Face detection runs synchronously off the main thread inside AsyncFunction; failures
   *    in any single frame are swallowed (that frame just has no face data).
   *  - Transformer is invoked on the main looper; we block the JS thread with a latch and a
   *    hard timeout, cancelling the transformer if it hangs.
   *  - Partial output is removed on any failure so the JS layer never sees a half-written file.
   *  - If the pre-pass finds zero faces in the entire video, we still run the transform with
   *    an empty face list; the shader passes pixels through unchanged → output ~= input.
   */
  @OptIn(UnstableApi::class)
  private fun performBeautify(
    videoUri: String,
    outputPath: String,
    intensity: Double
  ): Map<String, Any> {
    val sourcePath = resolveFilePath(videoUri)
    val cleanOutputPath = resolveFilePath(outputPath)
    val sourceFile = File(sourcePath)
    require(sourceFile.exists()) { "File not found: $sourcePath" }

    val outputFile = File(cleanOutputPath)
    outputFile.parentFile?.mkdirs()
    if (outputFile.exists()) outputFile.delete()

    val clampedIntensity = intensity.coerceIn(0.0, 1.0).toFloat()

    val context = appContext.reactContext?.applicationContext
      ?: throw IllegalStateException("React context unavailable for Transformer")

    // --- Pre-pass: detect faces across the video ---
    val faceFrames = runCatching {
      FaceDetectionService().detect(sourcePath, samplesPerSecond = 6f)
    }.getOrElse { err ->
      println("⚠️ [VideoExport] Face detection failed, will fall back to global blur: ${err.message}")
      emptyList()
    }
    println(
      "✨ [VideoExport] Face pre-pass: ${faceFrames.size} sampled frames with faces"
    )

    // --- Build the primary + fallback effect lists ---
    //
    // Primary: face-masked, edge-preserving (bilateral) smoothing via our custom GLSL
    // shader. Closely matches the iOS CIMedianFilter + CIGaussianBlur pipeline.
    //
    // Fallback: whole-frame Gaussian. Used when:
    //   - the pre-pass found ZERO faces (no people, ML Kit init error, etc.),
    //   - OR our custom shader crashes mid-export on a particular device GPU.
    //
    // Fallback sigma deliberately TAME (0.4..1.2 across intensity 0..1). The fallback
    // blurs the WHOLE FRAME — anything stronger looks like a "blur filter" was applied
    // to the entire scene, not a skin-smoothing effect. We'd rather under-deliver here
    // than ruin the video.
    val fallbackSigma = 0.4f + 0.8f * clampedIntensity
    val primaryEffects: List<Effect> = if (faceFrames.isEmpty()) {
      println("✨ [VideoExport] No faces found, using global GaussianBlur(sigma=$fallbackSigma)")
      listOf(GaussianBlur(fallbackSigma))
    } else {
      listOf(BeautyEffect(clampedIntensity, faceFrames))
    }
    val fallbackEffects: List<Effect> = listOf(GaussianBlur(fallbackSigma))

    val primaryError = runTransformer(
      context,
      singleItemComposition(sourceFile, primaryEffects),
      cleanOutputPath,
      BEAUTIFY_TIMEOUT_MINUTES
    )
    if (primaryError != null) {
      logCauseChain("Primary beautify pass failed", primaryError)

      // If the primary path was already the fallback (no faces), don't retry — we'd just
      // hit the same error. Bubble it up so the JS layer surfaces it.
      val primaryWasAlreadyFallback = primaryEffects.firstOrNull() is GaussianBlur
      if (primaryWasAlreadyFallback) {
        runCatching { outputFile.delete() }
        throw primaryError
      }

      println("⚠️ [VideoExport] Retrying with global GaussianBlur(sigma=$fallbackSigma)…")
      runCatching { outputFile.delete() }
      val fallbackError = runTransformer(
        context,
        singleItemComposition(sourceFile, fallbackEffects),
        cleanOutputPath,
        BEAUTIFY_TIMEOUT_MINUTES
      )
      if (fallbackError != null) {
        logCauseChain("Fallback beautify pass also failed", fallbackError)
        runCatching { outputFile.delete() }
        throw fallbackError
      }
      println("✨ [VideoExport] Beautify completed via fallback path")
    }

    if (!outputFile.exists() || outputFile.length() <= 0L) {
      throw IllegalStateException("Beautify produced no output at $cleanOutputPath")
    }

    println(
      "✨ [VideoExport] Android beautify completed: $cleanOutputPath " +
        "(intensity=$clampedIntensity, faceFrames=${faceFrames.size})"
    )
    return mapOf("path" to cleanOutputPath, "success" to true)
  }

  /** Wraps a single source file + video effects into a one-item Composition. */
  @OptIn(UnstableApi::class)
  private fun singleItemComposition(sourceFile: File, videoEffects: List<Effect>): Composition {
    val editedMediaItem = EditedMediaItem.Builder(MediaItem.fromUri(Uri.fromFile(sourceFile)))
      .setEffects(
        Effects(
          /* audioProcessors = */ emptyList(),
          /* videoEffects = */ videoEffects,
        )
      )
      .build()
    return Composition.Builder(EditedMediaItemSequence.Builder(editedMediaItem).build()).build()
  }

  /**
   * Synchronously runs a Media3 Transformer on the supplied composition, blocking
   * the caller until the export finishes, errors, or times out. Returns null on success,
   * or the underlying Throwable on failure (no exceptions thrown — callers decide whether
   * to retry, fall back, or rethrow).
   */
  @OptIn(UnstableApi::class)
  private fun runTransformer(
    context: android.content.Context,
    composition: Composition,
    outputPath: String,
    timeoutMinutes: Long
  ): Throwable? {
    val latch = CountDownLatch(1)
    val errorRef = AtomicReference<Throwable?>(null)
    val transformerRef = AtomicReference<Transformer?>(null)

    Handler(Looper.getMainLooper()).post {
      try {
        val transformer = Transformer.Builder(context)
          .addListener(object : Transformer.Listener {
            override fun onCompleted(
              composition: Composition,
              exportResult: ExportResult
            ) {
              latch.countDown()
            }

            override fun onError(
              composition: Composition,
              exportResult: ExportResult,
              exportException: ExportException
            ) {
              errorRef.set(exportException)
              latch.countDown()
            }
          })
          .build()

        transformerRef.set(transformer)
        transformer.start(composition, outputPath)
      } catch (t: Throwable) {
        errorRef.set(t)
        latch.countDown()
      }
    }

    val finished = latch.await(timeoutMinutes, TimeUnit.MINUTES)
    if (!finished) {
      Handler(Looper.getMainLooper()).post {
        runCatching { transformerRef.get()?.cancel() }
      }
      return IllegalStateException(
        "Transformer timed out after $timeoutMinutes minutes"
      )
    }

    return errorRef.get()
  }

  /**
   * Prints the entire exception cause chain so the device log shows the actual root
   * cause (GL compile errors, codec errors, etc.) instead of Media3's generic
   * "Video frame processing error" wrapper.
   */
  private fun logCauseChain(prefix: String, error: Throwable) {
    println("❌ [VideoExport] $prefix: ${error.javaClass.simpleName}: ${error.message}")
    var cause: Throwable? = error.cause
    var depth = 1
    while (cause != null && depth < 10) {
      println("    caused by [$depth]: ${cause.javaClass.simpleName}: ${cause.message}")
      cause = cause.cause
      depth++
    }
    // Print full stack of the top-level exception too — invaluable for GL/EGL errors that
    // surface only in stack frames, not in messages.
    error.printStackTrace()
  }

  companion object {
    private const val BEAUTIFY_TIMEOUT_MINUTES = 5L
    private const val EXPORT_TIMEOUT_MINUTES = 10L
  }

  private fun performExport(
    clips: List<Map<String, Any>>,
    outputPath: String,
    @Suppress("UNUSED_PARAMETER") settings: Map<String, Any>
  ): Map<String, Any> {
    require(clips.isNotEmpty()) { "No clips provided" }

    val cleanPath = resolveFilePath(outputPath)
    File(cleanPath).let { if (it.exists()) it.delete() }

    val validClips = mutableListOf<ValidClip>()
    var referenceVideoFormat: MediaFormat? = null
    var referenceAudioFormat: MediaFormat? = null
    var orientationHint: Int? = null

    for ((clipIdx, clipData) in clips.withIndex()) {
      val sourceUri = clipData["sourceUri"] as? String ?: continue
      val filePath = try {
        resolveFilePath(sourceUri)
      } catch (e: Exception) {
        println("⚠️ [VideoExport] Clip $clipIdx: ${e.message}")
        continue
      }

      if (!File(filePath).exists()) {
        println("⚠️ [VideoExport] Clip $clipIdx: File not found: $filePath")
        continue
      }

      val startTimeSec = (clipData["startTime"] as? Number)?.toDouble() ?: 0.0
      val endTimeSec = (clipData["endTime"] as? Number)?.toDouble()
      val startUs = (startTimeSec * 1_000_000L).toLong().coerceAtLeast(0L)
      val endUs = endTimeSec?.let { (it * 1_000_000L).toLong() }
      if (endUs != null && endUs <= startUs) {
        println("⚠️ [VideoExport] Clip $clipIdx: Ignoring empty range")
        continue
      }

      val videoFormat = findTrackFormat(filePath, "video/")
      val audioFormat = findTrackFormat(filePath, "audio/")
      if (videoFormat == null && audioFormat == null) {
        println("⚠️ [VideoExport] Clip $clipIdx: No audio/video tracks found")
        continue
      }

      if (videoFormat != null) {
        val currentReference = referenceVideoFormat
        if (currentReference == null) {
          referenceVideoFormat = videoFormat
          if (videoFormat.containsKey(MediaFormat.KEY_ROTATION)) {
            orientationHint = videoFormat.getInteger(MediaFormat.KEY_ROTATION)
          }
        } else if (!areFormatsCompatible(currentReference, videoFormat, true)) {
          throw IllegalArgumentException(
            "Clip $clipIdx has a different video format. Android stitching requires matching codec, width, and height."
          )
        }
      }

      if (audioFormat != null) {
        val currentReference = referenceAudioFormat
        if (currentReference == null) {
          referenceAudioFormat = audioFormat
        } else if (!areFormatsCompatible(currentReference, audioFormat, false)) {
          throw IllegalArgumentException(
            "Clip $clipIdx has a different audio format. Android stitching requires matching codec, sample rate, and channel count."
          )
        }
      }

      validClips.add(ValidClip(clipIdx, filePath, startUs, endUs))
    }

    require(validClips.isNotEmpty()) { "No valid clips were processed" }
    require(referenceVideoFormat != null || referenceAudioFormat != null) { "No audio/video tracks found" }

    File(cleanPath).parentFile?.mkdirs()

    // Stream-copy remuxing can only start a clip at a keyframe, so a mid-stream trim
    // start would slip forward to the next sync frame — up to a full GOP (~1-2 s on
    // phone camera recordings) of requested content lost. When any clip is start-trimmed,
    // re-encode through Media3 Transformer instead: it decodes and drops frames before
    // the trim point, making the cut frame-accurate. Failures fall back to the (fast,
    // lossless, but keyframe-snapped) remux path below so exports never hard-fail here.
    if (validClips.any { it.startUs > 0L }) {
      val preciseError = runPreciseTrimExport(validClips, cleanPath)
      if (preciseError == null) {
        println("✅ [VideoExport] Export completed (frame-accurate trim): $cleanPath")
        return mapOf("path" to cleanPath, "success" to true)
      }
      logCauseChain("Frame-accurate trim export failed, falling back to stream-copy stitching", preciseError)
      runCatching { File(cleanPath).delete() }
    }

    return performRemuxExport(validClips, cleanPath, referenceVideoFormat, referenceAudioFormat, orientationHint)
  }

  @OptIn(UnstableApi::class)
  private fun runPreciseTrimExport(clips: List<ValidClip>, outputPath: String): Throwable? {
    val context = appContext.reactContext?.applicationContext
      ?: return IllegalStateException("React context unavailable for Transformer")

    val editedItems = clips.map { clip ->
      val clipping = MediaItem.ClippingConfiguration.Builder()
        .setStartPositionUs(clip.startUs)
        .apply { clip.endUs?.let { setEndPositionUs(it) } }
        .build()
      val mediaItem = MediaItem.Builder()
        .setUri(Uri.fromFile(File(clip.filePath)))
        .setClippingConfiguration(clipping)
        .build()
      EditedMediaItem.Builder(mediaItem)
        .apply {
          if (clips.size == 1) {
            // A single-item sequence is transmuxed (stream-copied) by Transformer, and
            // transmuxed trims snap to keyframes — the exact inaccuracy this path exists
            // to avoid. An identity RgbAdjustment changes no pixels but forces the
            // transcode pipeline. Multi-item sequences already transcode by default
            // (Composition.transmuxVideo is false).
            setEffects(
              Effects(
                /* audioProcessors = */ emptyList(),
                /* videoEffects = */ listOf(RgbAdjustment.Builder().build()),
              )
            )
          }
        }
        .build()
    }

    val composition = Composition.Builder(
      EditedMediaItemSequence.Builder(editedItems).build()
    ).build()

    val error = runTransformer(context, composition, outputPath, EXPORT_TIMEOUT_MINUTES)
    if (error != null) return error

    val outputFile = File(outputPath)
    if (!outputFile.exists() || outputFile.length() <= 0L) {
      return IllegalStateException("Transformer produced no output at $outputPath")
    }
    return null
  }

  private fun performRemuxExport(
    validClips: List<ValidClip>,
    cleanPath: String,
    referenceVideoFormat: MediaFormat?,
    referenceAudioFormat: MediaFormat?,
    orientationHint: Int?
  ): Map<String, Any> {
    val outputVideoFormat = referenceVideoFormat
    val outputAudioFormat = referenceAudioFormat

    val muxer = MediaMuxer(cleanPath, MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4)
    var muxerStarted = false
    var videoMuxerTrack = -1
    var audioMuxerTrack = -1
    var compositionUs = 0L
    var totalSamplesWritten = 0

    try {
      outputVideoFormat?.let { videoFormat ->
        orientationHint?.takeIf { it != 0 }?.let { rotation ->
          muxer.setOrientationHint(rotation)
          println("📐 [VideoExport] Preserving rotation: $rotation°")
        }
        videoMuxerTrack = muxer.addTrack(videoFormat)
      }
      outputAudioFormat?.let { audioFormat ->
        audioMuxerTrack = muxer.addTrack(audioFormat)
      }
      muxer.start()
      muxerStarted = true

      // Direct buffer required: GetDirectBufferCapacity() returns -1 for heap buffers on
      // some Android versions, causing readSampleData / writeSampleData to fail for
      // camera recordings with large I-frames. 32 MB gives comfortable headroom for 4 K.
      val buffer = ByteBuffer.allocateDirect(32 * 1024 * 1024)

      for (clip in validClips) {
        var clipStartUs = clip.startUs

        if (videoMuxerTrack >= 0) {
          val probeExtractor = MediaExtractor()
          try {
            probeExtractor.setDataSource(clip.filePath)
            val videoTrack = findFirstTrack(probeExtractor, "video/")
            if (videoTrack >= 0) {
              probeExtractor.selectTrack(videoTrack)
              seekToWriteStart(probeExtractor, clip.startUs, clip.endUs, true)?.let {
                clipStartUs = it
              }
            }
          } finally {
            probeExtractor.release()
          }
        }

        val videoResult = if (videoMuxerTrack >= 0 && outputVideoFormat != null) {
          writeTrackSamples(
            filePath = clip.filePath,
            mimePrefix = "video/",
            muxer = muxer,
            muxerTrack = videoMuxerTrack,
            clipStartUs = clipStartUs,
            endUs = clip.endUs,
            compositionUs = compositionUs,
            buffer = buffer,
            isVideo = true,
            format = outputVideoFormat
          )
        } else {
          TrackWriteResult(0, 0L, 0L)
        }

        val audioResult = if (audioMuxerTrack >= 0 && outputAudioFormat != null) {
          writeTrackSamples(
            filePath = clip.filePath,
            mimePrefix = "audio/",
            muxer = muxer,
            muxerTrack = audioMuxerTrack,
            clipStartUs = clipStartUs,
            endUs = clip.endUs,
            compositionUs = compositionUs,
            buffer = buffer,
            isVideo = false,
            format = outputAudioFormat
          )
        } else {
          TrackWriteResult(0, 0L, 0L)
        }

        val clipDurationUs = maxOf(videoResult.timelineDurationUs, audioResult.timelineDurationUs)
        if (clipDurationUs <= 0L) {
          println("⚠️ [VideoExport] Clip ${clip.originalIndex}: No samples written")
          continue
        }

        totalSamplesWritten += videoResult.samplesWritten + audioResult.samplesWritten
        compositionUs += clipDurationUs

        println(
          "📹 [VideoExport] Clip ${clip.originalIndex}: written, " +
            "videoSamples=${videoResult.samplesWritten}, " +
            "audioSamples=${audioResult.samplesWritten}, " +
            "duration=${clipDurationUs / 1_000_000.0}s"
        )
      }

      if (!muxerStarted) throw IllegalStateException("No valid clips were processed")
      if (totalSamplesWritten <= 0) throw IllegalStateException("No samples were written")
      muxer.stop()
    } catch (e: Exception) {
      runCatching { if (muxerStarted && totalSamplesWritten > 0) muxer.stop() }
      runCatching { File(cleanPath).delete() }
      throw e
    } finally {
      muxer.release()
    }

    println("✅ [VideoExport] Export completed: $cleanPath")
    return mapOf("path" to cleanPath, "success" to true)
  }
}
