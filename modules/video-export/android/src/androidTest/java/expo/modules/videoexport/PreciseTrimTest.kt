package expo.modules.videoexport

import android.media.MediaCodec
import android.media.MediaCodecInfo
import android.media.MediaFormat
import android.media.MediaMetadataRetriever
import android.media.MediaMuxer
import android.net.Uri
import android.os.Handler
import android.os.Looper
import androidx.media3.common.MediaItem
import androidx.media3.common.util.UnstableApi
import androidx.media3.effect.RgbAdjustment
import androidx.media3.transformer.Composition
import androidx.media3.transformer.EditedMediaItem
import androidx.media3.transformer.EditedMediaItemSequence
import androidx.media3.transformer.Effects
import androidx.media3.transformer.ExportException
import androidx.media3.transformer.ExportResult
import androidx.media3.transformer.Transformer
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File
import java.nio.ByteBuffer
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference

/**
 * Empirical test of the frame-accurate trim logic added in commit 084678c
 * (VideoExportModule.runPreciseTrimExport). Builds the SAME Composition of
 * clipped EditedMediaItems and asserts the output duration matches the
 * requested trim, not the keyframe-snapped one.
 *
 * The source video is synthesized with a 2s GOP (keyframes at 0s and 2s only),
 * so a start trim at 1.0s makes the two behaviors clearly distinguishable:
 *   - frame-accurate: 4s clip trimmed at 1s -> ~3.0s output
 *   - keyframe-snapped (old remux bug): starts at 2s keyframe -> ~2.0s output
 */
@RunWith(AndroidJUnit4::class)
class PreciseTrimTest {

  private val context = InstrumentationRegistry.getInstrumentation().targetContext

  @Test
  fun singleClip_startTrimAtNonKeyframe_isFrameAccurate() {
    val source = generateLongGopVideo("source-single.mp4", durationSec = 4)
    val output = File(context.cacheDir, "out-single.mp4").also { it.delete() }

    // Mirrors runPreciseTrimExport for clips.size == 1: clipping config + identity
    // RgbAdjustment to force the transcode path.
    val item = clippedItem(source, startUs = 1_000_000L, endUs = null)
    val edited = EditedMediaItem.Builder(item)
      .setEffects(Effects(emptyList(), listOf(RgbAdjustment.Builder().build())))
      .build()
    val composition =
      Composition.Builder(EditedMediaItemSequence.Builder(edited).build()).build()

    val error = runTransformer(composition, output.absolutePath)
    assertNull("Transformer failed: $error", error)

    val durationMs = videoDurationMs(output)
    // 4s - 1s trim = 3s. Keyframe snapping would give ~2s.
    assertTrue(
      "Expected ~3000ms (frame-accurate), got ${durationMs}ms — " +
        if (durationMs in 1800..2200) "output snapped to the 2s keyframe (bug present)" else "unexpected duration",
      durationMs in 2800..3300
    )
  }

  @Test
  fun multiClip_startTrims_areFrameAccurate() {
    val a = generateLongGopVideo("source-a.mp4", durationSec = 4)
    val b = generateLongGopVideo("source-b.mp4", durationSec = 4)
    val output = File(context.cacheDir, "out-multi.mp4").also { it.delete() }

    // Mirrors runPreciseTrimExport for clips.size > 1: no forced effect; the
    // multi-item sequence transcodes by default.
    val items = listOf(
      clippedItem(a, startUs = 1_000_000L, endUs = 3_500_000L), // 2.5s
      clippedItem(b, startUs = 500_000L, endUs = null)          // 3.5s
    ).map { EditedMediaItem.Builder(it).build() }
    val composition =
      Composition.Builder(EditedMediaItemSequence.Builder(items).build()).build()

    val error = runTransformer(composition, output.absolutePath)
    assertNull("Transformer failed: $error", error)

    val durationMs = videoDurationMs(output)
    // 2.5s + 3.5s = 6s total. Keyframe snapping on both would give ~1.5s + 2s = 3.5s.
    assertTrue(
      "Expected ~6000ms (frame-accurate), got ${durationMs}ms",
      durationMs in 5600..6500
    )
  }

  private fun clippedItem(source: File, startUs: Long, endUs: Long?): MediaItem {
    val clipping = MediaItem.ClippingConfiguration.Builder()
      .setStartPositionUs(startUs)
      .apply { endUs?.let { setEndPositionUs(it) } }
      .build()
    return MediaItem.Builder()
      .setUri(Uri.fromFile(source))
      .setClippingConfiguration(clipping)
      .build()
  }

  /** Same synchronous latch-on-main-looper pattern as VideoExportModule.runTransformer. */
  @OptIn(UnstableApi::class)
  private fun runTransformer(composition: Composition, outputPath: String): Throwable? {
    val latch = CountDownLatch(1)
    val errorRef = AtomicReference<Throwable?>(null)

    Handler(Looper.getMainLooper()).post {
      try {
        val transformer = Transformer.Builder(context)
          .addListener(object : Transformer.Listener {
            override fun onCompleted(c: Composition, r: ExportResult) = latch.countDown()
            override fun onError(c: Composition, r: ExportResult, e: ExportException) {
              errorRef.set(e)
              latch.countDown()
            }
          })
          .build()
        transformer.start(composition, outputPath)
      } catch (t: Throwable) {
        errorRef.set(t)
        latch.countDown()
      }
    }

    if (!latch.await(5, TimeUnit.MINUTES)) return IllegalStateException("Transformer timed out")
    return errorRef.get()
  }

  private fun videoDurationMs(file: File): Long {
    val retriever = MediaMetadataRetriever()
    return try {
      retriever.setDataSource(file.absolutePath)
      retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)!!.toLong()
    } finally {
      retriever.release()
    }
  }

  /**
   * Encodes a solid-color AVC video at 30fps with KEY_I_FRAME_INTERVAL = 2,
   * i.e. keyframes only at 0s and 2s — a long GOP that makes keyframe snapping
   * observable.
   */
  private fun generateLongGopVideo(name: String, durationSec: Int): File {
    val width = 320
    val height = 240
    val fps = 30
    val frameCount = durationSec * fps
    val out = File(context.cacheDir, name).also { it.delete() }

    val format = MediaFormat.createVideoFormat(MediaFormat.MIMETYPE_VIDEO_AVC, width, height).apply {
      setInteger(
        MediaFormat.KEY_COLOR_FORMAT,
        MediaCodecInfo.CodecCapabilities.COLOR_FormatYUV420Flexible
      )
      setInteger(MediaFormat.KEY_BIT_RATE, 500_000)
      setInteger(MediaFormat.KEY_FRAME_RATE, fps)
      setInteger(MediaFormat.KEY_I_FRAME_INTERVAL, 2)
    }

    val codec = MediaCodec.createEncoderByType(MediaFormat.MIMETYPE_VIDEO_AVC)
    codec.configure(format, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE)
    codec.start()

    val muxer = MediaMuxer(out.absolutePath, MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4)
    var trackIndex = -1
    var muxerStarted = false
    val bufferInfo = MediaCodec.BufferInfo()
    var framesQueued = 0
    var inputDone = false
    var outputDone = false

    while (!outputDone) {
      if (!inputDone) {
        val inIndex = codec.dequeueInputBuffer(10_000)
        if (inIndex >= 0) {
          if (framesQueued >= frameCount) {
            codec.queueInputBuffer(inIndex, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM)
            inputDone = true
          } else {
            val image = codec.getInputImage(inIndex)!!
            for (plane in image.planes) {
              fillPlane(plane.buffer, 0x80.toByte())
            }
            val ptsUs = framesQueued * 1_000_000L / fps
            // Size for flexible YUV input: full frame in the image; pass nominal size.
            codec.queueInputBuffer(inIndex, 0, width * height * 3 / 2, ptsUs, 0)
            framesQueued++
          }
        }
      }

      val outIndex = codec.dequeueOutputBuffer(bufferInfo, 10_000)
      when {
        outIndex == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED -> {
          trackIndex = muxer.addTrack(codec.outputFormat)
          muxer.start()
          muxerStarted = true
        }
        outIndex >= 0 -> {
          val buf = codec.getOutputBuffer(outIndex)!!
          if (bufferInfo.size > 0 && muxerStarted &&
            (bufferInfo.flags and MediaCodec.BUFFER_FLAG_CODEC_CONFIG) == 0
          ) {
            muxer.writeSampleData(trackIndex, buf, bufferInfo)
          }
          codec.releaseOutputBuffer(outIndex, false)
          if ((bufferInfo.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM) != 0) {
            outputDone = true
          }
        }
      }
    }

    codec.stop()
    codec.release()
    muxer.stop()
    muxer.release()
    return out
  }

  private fun fillPlane(buffer: ByteBuffer, value: Byte) {
    buffer.rewind()
    while (buffer.hasRemaining()) buffer.put(value)
    buffer.rewind()
  }
}
