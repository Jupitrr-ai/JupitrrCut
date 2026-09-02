import ExpoModulesCore
import AVFoundation
import CoreImage
import ImageIO
import UIKit
import Vision

public class VideoExportModule: Module {
  public func definition() -> ModuleDefinition {
    Name("VideoExport")

    AsyncFunction("exportVideo") { (clips: [[String: Any]], outputPath: String, settings: [String: Any]) -> [String: Any] in
      return try await self.performExport(clips: clips, outputPath: outputPath, settings: settings)
    }

    AsyncFunction("analyzeAudioLevels") { (videoUri: String, chunkMs: Double) -> [[String: Any]] in
      return try await self.performAudioAnalysis(videoUri: videoUri, chunkMs: chunkMs)
    }

    AsyncFunction("beautifyVideo") { (videoUri: String, outputPath: String, intensity: Double) -> [String: Any] in
      return try await self.performBeautify(videoUri: videoUri, outputPath: outputPath, intensity: intensity)
    }
  }

  // MARK: - Export Implementation

  private func performExport(clips: [[String: Any]], outputPath: String, settings: [String: Any]) async throws -> [String: Any] {
    // Parse settings
    let quality = settings["quality"] as? String ?? "medium"
    let format = settings["format"] as? String ?? "mp4"
    let resolution = settings["resolution"] as? String ?? "1080p"

    // Validate inputs
    guard !clips.isEmpty else {
      throw VideoExportError.invalidClips("No clips provided for export")
    }

    // Create composition
    let composition = AVMutableComposition()
    var currentTime = CMTime.zero
    var renderSize = CGSize.zero
    var isPortraitVideo = false

    // Track audio mix parameters for volume control
    var audioMixParams: [AVMutableAudioMixInputParameters] = []

    // Track video composition instructions (one per clip)
    var videoInstructions: [AVMutableVideoCompositionInstruction] = []

    // Create SINGLE shared composition tracks (revert from multiple-tracks approach)
    guard let compositionVideoTrack = composition.addMutableTrack(
      withMediaType: .video,
      preferredTrackID: kCMPersistentTrackID_Invalid
    ) else {
      throw VideoExportError.trackError("Failed to create video track")
    }

    guard let compositionAudioTrack = composition.addMutableTrack(
      withMediaType: .audio,
      preferredTrackID: kCMPersistentTrackID_Invalid
    ) else {
      throw VideoExportError.trackError("Failed to create audio track")
    }

    for (clipIndex, clipData) in clips.enumerated() {
      // Parse clip data
      guard let sourceUri = clipData["sourceUri"] as? String,
            let startTime = clipData["startTime"] as? Double,
            let speed = clipData["speed"] as? Double,
            let volume = clipData["volume"] as? Double else {
        print("⚠️ [VideoExport] Clip \(clipIndex): Missing required fields")
        continue
      }

      // Resolve to a local file path (handles file://, absolute path, and rejects remote URLs)
      guard let fileURL = self.resolveFileURL(sourceUri: sourceUri) else {
        print("⚠️ [VideoExport] Clip \(clipIndex): Not a local file URI or file not found: \(sourceUri.prefix(80))...")
        continue
      }
      let cleanPath = fileURL.path

      let asset = AVAsset(url: fileURL)

      // Check if file exists (resolved path may differ from raw URI)
      if !FileManager.default.fileExists(atPath: cleanPath) {
        print("⚠️ [VideoExport] Clip \(clipIndex): File not found at \(cleanPath)")
        continue
      }

      // Clamp endTime to actual asset duration to prevent black frames.
      // If endTime is omitted, use full asset duration.
      let assetDuration = try await asset.load(.duration)
      let actualEndSeconds = CMTimeGetSeconds(assetDuration)
      let requestedEndTime = clipData["endTime"] as? Double ?? actualEndSeconds
      let clampedEndTime = min(requestedEndTime, actualEndSeconds)

      print("📹 [VideoExport] Clip \(clipIndex):")
      print("   - Source: \(cleanPath.components(separatedBy: "/").last ?? "unknown")")
      print("   - Duration: \(actualEndSeconds)s")
      print("   - Trim: \(startTime)s - \(clampedEndTime)s (requested \(requestedEndTime)s)")
      print("   - Speed: \(speed)x, Volume: \(volume)")

      // Calculate time ranges
      // Build CMTime ranges from clamped values to avoid invalid/negative trims.
      let safeStart = max(0, min(startTime, clampedEndTime))
      let safeEnd = max(safeStart, clampedEndTime)
      let sourceStartTime = CMTime(seconds: safeStart, preferredTimescale: 600)
      let sourceEnd = CMTime(seconds: safeEnd, preferredTimescale: 600)
      let sourceDuration = CMTimeSubtract(sourceEnd, sourceStartTime)

      // Skip clips with zero or negative duration
      if CMTimeGetSeconds(sourceDuration) <= 0 {
        continue
      }

      let sourceTimeRange = CMTimeRange(start: sourceStartTime, duration: sourceDuration)

      // Clip duration in final composition (derive from CMTime to avoid Float rounding drift).
      let clipDuration = speed == 1.0
        ? sourceDuration
        : CMTimeMultiplyByFloat64(sourceDuration, multiplier: 1.0 / speed)

      // Add video track - use SINGLE shared track
      if let videoTrack = asset.tracks(withMediaType: .video).first {
        // Insert the trimmed range into shared track
        try compositionVideoTrack.insertTimeRange(
          sourceTimeRange,
          of: videoTrack,
          at: currentTime
        )

        // Skip speed scaling when speed=1.0 (avoids "operation stopped" error with trimmed content)
        if speed != 1.0 {
          compositionVideoTrack.scaleTimeRange(
            CMTimeRange(start: currentTime, duration: sourceDuration),
            toDuration: clipDuration
          )
        }

        // Set render size from first video track (considering transform), capped to the
        // requested ceiling. calculateFinalTransform already aspect-fills to whatever
        // renderSize it is handed, so capping here is all that is needed to retarget.
        if renderSize == .zero {
          let sourceSize = self.getTransformedSize(for: videoTrack)
          renderSize = self.capRenderSize(sourceSize, to: resolution)
          let transform = videoTrack.preferredTransform
          isPortraitVideo = transform.a == 0 && transform.d == 0
        }

        // Create layer instruction for this clip
        let layerInstruction = AVMutableVideoCompositionLayerInstruction(assetTrack: compositionVideoTrack)

        // Calculate the proper transform (handles rotation + optional crop)
        let finalTransform = self.calculateFinalTransform(
          videoTrack: videoTrack,
          renderSize: renderSize,
          crop: clipData["crop"] as? [String: Any]
        )

        // Transform keyframes are on composition timeline.
        layerInstruction.setTransform(finalTransform, at: currentTime)

        // Create instruction for this specific clip's time range
        let videoInstruction = AVMutableVideoCompositionInstruction()
        videoInstruction.timeRange = CMTimeRange(start: currentTime, duration: clipDuration)
        videoInstruction.layerInstructions = [layerInstruction]
        videoInstructions.append(videoInstruction)
      }

      // Add audio track - use SINGLE shared track
      if let audioTrack = asset.tracks(withMediaType: .audio).first {
        // Insert the trimmed range into shared track
        try compositionAudioTrack.insertTimeRange(
          sourceTimeRange,
          of: audioTrack,
          at: currentTime
        )

        // Skip speed scaling when speed=1.0 (avoids "operation stopped" error with trimmed content)
        if speed != 1.0 {
          compositionAudioTrack.scaleTimeRange(
            CMTimeRange(start: currentTime, duration: sourceDuration),
            toDuration: clipDuration
          )
        }

        // Apply volume using audio mix
        if volume != 1.0 {
          let audioMixParam = AVMutableAudioMixInputParameters(track: compositionAudioTrack)
          audioMixParam.setVolume(Float(volume), at: currentTime)
          audioMixParams.append(audioMixParam)
        }
      }

      print("   - Inserted at composition time: \(CMTimeGetSeconds(currentTime))s")
      print("   - Clip duration in composition: \(CMTimeGetSeconds(clipDuration))s")

      // Move to next clip position
      currentTime = CMTimeAdd(currentTime, clipDuration)
    }

    print("📊 [VideoExport] Composition summary:")
    print("   - Total clips processed: \(videoInstructions.count)")
    print("   - Final composition duration: \(CMTimeGetSeconds(currentTime))s")
    print("   - Render size: \(renderSize == .zero ? self.getResolutionSize(resolution) : renderSize)")

    // Configure video composition
    let videoComposition = AVMutableVideoComposition()
    videoComposition.frameDuration = CMTime(value: 1, timescale: 30)
    videoComposition.renderSize = renderSize == .zero ? self.getResolutionSize(resolution) : renderSize
    videoComposition.instructions = videoInstructions

    // Create audio mix if we have volume adjustments
    var audioMix: AVMutableAudioMix?
    if !audioMixParams.isEmpty {
      audioMix = AVMutableAudioMix()
      audioMix?.inputParameters = audioMixParams
    }

    // Output path setup
    let cleanOutputPath = outputPath.replacingOccurrences(of: "file://", with: "")
    let outputURL = URL(fileURLWithPath: cleanOutputPath)
    if FileManager.default.fileExists(atPath: cleanOutputPath) {
      try? FileManager.default.removeItem(at: outputURL)
    }

    let fileType: AVFileType = format == "mov" ? .mov : .mp4
    let finalRenderSize = videoComposition.renderSize

    print("🎬 [VideoExport] Starting export to: \(cleanOutputPath)")
    print("   - Render size: \(finalRenderSize)")
    print("   - Composition duration: \(CMTimeGetSeconds(composition.duration))s")

    // PRIMARY PATH: AVAssetReader → AVAssetWriter with explicit constant-frame-rate H.264 video
    // and a clean 48kHz / 192kbps AAC audio track. Unlike AVAssetExportSession (which exposes no
    // audio-encoding controls and emits AVFoundation variable-frame-rate timing), this yields a
    // file a downstream transcoder like Mux can re-encode WITHOUT introducing the audio buzz that
    // appears when Mux conforms a VFR + edit-list-primed export to constant frame rate.
    do {
      try await self.exportViaAssetWriter(
        composition: composition,
        videoComposition: videoComposition,
        audioMix: audioMix,
        outputURL: outputURL,
        fileType: fileType,
        renderSize: finalRenderSize,
        quality: quality
      )
      print("✅ [VideoExport] Export completed (AVAssetWriter / CFR path)")
      return ["path": cleanOutputPath, "success": true]
    } catch {
      // Fallback to the legacy AVAssetExportSession path so exporting never hard-fails if the
      // writer path errors on a particular device/OS.
      print("⚠️ [VideoExport] AVAssetWriter path failed (\(error.localizedDescription)); falling back to AVAssetExportSession")
      if FileManager.default.fileExists(atPath: cleanOutputPath) {
        try? FileManager.default.removeItem(at: outputURL)
      }
      try await self.exportViaSession(
        composition: composition,
        videoComposition: videoComposition,
        audioMix: audioMix,
        outputURL: outputURL,
        fileType: fileType,
        quality: quality,
        resolution: resolution,
        isPortrait: isPortraitVideo
      )
      print("✅ [VideoExport] Export completed (legacy AVAssetExportSession fallback)")
      return ["path": cleanOutputPath, "success": true]
    }
  }

  // MARK: - Conformed export (AVAssetReader → AVAssetWriter)

  /// Writes the composition to `outputURL` with a constant 30fps H.264 video track and a clean
  /// 48kHz / 192kbps AAC stereo audio track. Gives explicit control over audio encoding and frame
  /// timing (which AVAssetExportSession does not), producing a Mux-friendly file.
  private func exportViaAssetWriter(
    composition: AVComposition,
    videoComposition: AVVideoComposition,
    audioMix: AVAudioMix?,
    outputURL: URL,
    fileType: AVFileType,
    renderSize: CGSize,
    quality: String
  ) async throws {
    let reader = try AVAssetReader(asset: composition)
    let writer = try AVAssetWriter(url: outputURL, fileType: fileType)
    writer.shouldOptimizeForNetworkUse = true

    // --- Video: composite transforms via videoComposition, emit CFR frames ---
    let videoTracks = composition.tracks(withMediaType: .video)
    guard !videoTracks.isEmpty else {
      throw VideoExportError.trackError("No video tracks to export")
    }
    let videoReaderOutput = AVAssetReaderVideoCompositionOutput(
      videoTracks: videoTracks,
      videoSettings: [kCVPixelBufferPixelFormatTypeKey as String: Int(kCVPixelFormatType_32BGRA)]
    )
    videoReaderOutput.videoComposition = videoComposition
    videoReaderOutput.alwaysCopiesSampleData = false
    guard reader.canAdd(videoReaderOutput) else {
      throw VideoExportError.trackError("Cannot add video composition output")
    }
    reader.add(videoReaderOutput)

    let width = Int(renderSize.width.rounded())
    let height = Int(renderSize.height.rounded())
    let videoWriterInput = AVAssetWriterInput(
      mediaType: .video,
      outputSettings: [
        AVVideoCodecKey: AVVideoCodecType.h264,
        AVVideoWidthKey: width,
        AVVideoHeightKey: height,
        AVVideoCompressionPropertiesKey: [
          AVVideoAverageBitRateKey: self.videoBitrate(quality: quality, width: width, height: height),
          AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel,
          AVVideoMaxKeyFrameIntervalKey: 60,
          // Disable B-frames so the output carries no video edit-list/CTS offset. Combined with
          // the composition render (which bakes any source edit), this leaves audio+video both
          // starting at presentation 0 — preventing the ~0.3s A/V drift Mux introduces when it
          // mishandles a leftover video edit list.
          AVVideoAllowFrameReorderingKey: false
        ]
      ]
    )
    videoWriterInput.expectsMediaDataInRealTime = false
    guard writer.canAdd(videoWriterInput) else {
      throw VideoExportError.trackError("Cannot add video writer input")
    }
    writer.add(videoWriterInput)

    // --- Audio: apply audioMix (volume), decode to PCM, re-encode to clean AAC ---
    let audioTracks = composition.tracks(withMediaType: .audio)
    var audioReaderOutput: AVAssetReaderAudioMixOutput?
    var audioWriterInput: AVAssetWriterInput?
    if !audioTracks.isEmpty {
      let aOut = AVAssetReaderAudioMixOutput(
        audioTracks: audioTracks,
        audioSettings: [
          AVFormatIDKey: Int(kAudioFormatLinearPCM),
          AVSampleRateKey: 48000,
          AVNumberOfChannelsKey: 2,
          AVLinearPCMBitDepthKey: 16,
          AVLinearPCMIsBigEndianKey: false,
          AVLinearPCMIsFloatKey: false,
          AVLinearPCMIsNonInterleaved: false
        ]
      )
      aOut.audioMix = audioMix
      aOut.alwaysCopiesSampleData = false
      guard reader.canAdd(aOut) else {
        throw VideoExportError.trackError("Cannot add audio mix output")
      }
      reader.add(aOut)
      audioReaderOutput = aOut

      let aIn = AVAssetWriterInput(
        mediaType: .audio,
        outputSettings: [
          AVFormatIDKey: Int(kAudioFormatMPEG4AAC),
          AVSampleRateKey: 48000,
          AVNumberOfChannelsKey: 2,
          AVEncoderBitRateKey: 192000
        ]
      )
      aIn.expectsMediaDataInRealTime = false
      guard writer.canAdd(aIn) else {
        throw VideoExportError.trackError("Cannot add audio writer input")
      }
      writer.add(aIn)
      audioWriterInput = aIn
    }

    guard reader.startReading() else {
      throw VideoExportError.exportFailed("Reader failed to start: \(reader.error?.localizedDescription ?? "unknown")")
    }
    guard writer.startWriting() else {
      throw VideoExportError.exportFailed("Writer failed to start: \(writer.error?.localizedDescription ?? "unknown")")
    }
    writer.startSession(atSourceTime: .zero)

    // Pump video + audio concurrently, then finalize.
    try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
      let group = DispatchGroup()

      group.enter()
      videoWriterInput.requestMediaDataWhenReady(on: DispatchQueue(label: "com.jupitrr.videoexport.video")) {
        while videoWriterInput.isReadyForMoreMediaData {
          if let sample = videoReaderOutput.copyNextSampleBuffer() {
            if !videoWriterInput.append(sample) {
              videoWriterInput.markAsFinished()
              group.leave()
              return
            }
          } else {
            videoWriterInput.markAsFinished()
            group.leave()
            return
          }
        }
      }

      if let audioWriterInput = audioWriterInput, let audioReaderOutput = audioReaderOutput {
        group.enter()
        audioWriterInput.requestMediaDataWhenReady(on: DispatchQueue(label: "com.jupitrr.videoexport.audio")) {
          while audioWriterInput.isReadyForMoreMediaData {
            if let sample = audioReaderOutput.copyNextSampleBuffer() {
              if !audioWriterInput.append(sample) {
                audioWriterInput.markAsFinished()
                group.leave()
                return
              }
            } else {
              audioWriterInput.markAsFinished()
              group.leave()
              return
            }
          }
        }
      }

      group.notify(queue: DispatchQueue.global()) {
        if reader.status == .failed {
          continuation.resume(throwing: VideoExportError.exportFailed("Reader failed: \(reader.error?.localizedDescription ?? "unknown")"))
          return
        }
        writer.finishWriting {
          if writer.status == .completed {
            continuation.resume(returning: ())
          } else {
            continuation.resume(throwing: VideoExportError.exportFailed("Writer failed: \(writer.error?.localizedDescription ?? "unknown")"))
          }
        }
      }
    }
  }

  /// Approximate H.264 average bitrate for the conformed export, scaled by pixel count + quality.
  private func videoBitrate(quality: String, width: Int, height: Int) -> Int {
    let pixels = Double(max(width * height, 1))
    let bppf: Double  // bits per pixel per frame at 30fps
    switch quality {
    case "high": bppf = 0.12
    case "low": bppf = 0.06
    default: bppf = 0.09
    }
    let bitrate = pixels * 30.0 * bppf
    return Int(min(max(bitrate, 2_000_000), 24_000_000))
  }

  /// Legacy fallback using AVAssetExportSession. Kept so exporting never hard-fails if the
  /// AVAssetWriter path errors on a given device/OS.
  private func exportViaSession(
    composition: AVComposition,
    videoComposition: AVVideoComposition,
    audioMix: AVAudioMix?,
    outputURL: URL,
    fileType: AVFileType,
    quality: String,
    resolution: String,
    isPortrait: Bool
  ) async throws {
    let exportPreset = self.getExportPreset(quality: quality, resolution: resolution, isPortrait: isPortrait)
    guard let exportSession = AVAssetExportSession(asset: composition, presetName: exportPreset) else {
      throw VideoExportError.exportSessionError("Failed to create export session")
    }
    exportSession.outputURL = outputURL
    exportSession.outputFileType = fileType
    exportSession.videoComposition = videoComposition
    exportSession.audioMix = audioMix
    exportSession.shouldOptimizeForNetworkUse = true

    try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
      exportSession.exportAsynchronously {
        switch exportSession.status {
        case .completed:
          continuation.resume(returning: ())
        case .failed:
          continuation.resume(throwing: VideoExportError.exportFailed(exportSession.error?.localizedDescription ?? "Unknown error"))
        case .cancelled:
          continuation.resume(throwing: VideoExportError.exportCancelled)
        default:
          continuation.resume(throwing: VideoExportError.unknownError)
        }
      }
    }
  }

  // MARK: - Audio Analysis

  private func performAudioAnalysis(videoUri: String, chunkMs: Double) async throws -> [[String: Any]] {
    guard let fileURL = resolveFileURL(sourceUri: videoUri) else {
      throw VideoExportError.invalidClips("Not a local file URI (remote URLs must be downloaded first): \(videoUri.prefix(80))")
    }
    let cleanPath = fileURL.path

    guard FileManager.default.fileExists(atPath: cleanPath) else {
      throw VideoExportError.invalidClips("File not found: \(cleanPath)")
    }

    let asset = AVAsset(url: fileURL)

    // Use synchronous API (matches exportVideo pattern) — loadTracks can fail on simulator
    guard let audioTrack = asset.tracks(withMediaType: .audio).first else {
      throw VideoExportError.trackError("No audio track found in: \(cleanPath)")
    }

    let reader = try AVAssetReader(asset: asset)

    let outputSettings: [String: Any] = [
      AVFormatIDKey: kAudioFormatLinearPCM,
      AVLinearPCMBitDepthKey: 16,
      AVLinearPCMIsBigEndianKey: false,
      AVLinearPCMIsFloatKey: false,
      AVLinearPCMIsNonInterleaved: false,
      AVSampleRateKey: 44100,
      AVNumberOfChannelsKey: 2
    ]

    let output = AVAssetReaderTrackOutput(track: audioTrack, outputSettings: outputSettings)
    reader.add(output)

    guard reader.startReading() else {
      throw VideoExportError.trackError("Failed to start reading audio: \(reader.error?.localizedDescription ?? "unknown")")
    }

    let sampleRate = 44100.0
    let samplesPerChunk = Int(sampleRate * chunkMs / 1000.0)
    var results: [[String: Any]] = []
    var sampleBuffer: [Int16] = []
    var totalMonoSamplesRead = 0

    while reader.status == .reading {
      guard let buffer = output.copyNextSampleBuffer() else { break }

      guard let blockBuffer = CMSampleBufferGetDataBuffer(buffer) else {
        CMSampleBufferInvalidate(buffer)
        continue
      }

      let length = CMBlockBufferGetDataLength(blockBuffer)
      var data = Data(count: length)
      data.withUnsafeMutableBytes { rawBuffer in
        if let baseAddress = rawBuffer.baseAddress {
          CMBlockBufferCopyDataBytes(blockBuffer, atOffset: 0, dataLength: length, destination: baseAddress)
        }
      }

      CMSampleBufferInvalidate(buffer)

      let rawSamples = data.withUnsafeBytes { rawBuffer in
        Array(rawBuffer.bindMemory(to: Int16.self))
      }
      // Interleaved [L0, R0, L1, R1, ...] → mono (L+R)/2 so both channels contribute to level
      let mono = stride(from: 0, to: rawSamples.count, by: 2).map { i in
        let l = Int(rawSamples[i])
        let r = i + 1 < rawSamples.count ? Int(rawSamples[i + 1]) : 0
        return Int16(clamping: (l + r) / 2)
      }
      sampleBuffer.append(contentsOf: mono)

      while sampleBuffer.count >= samplesPerChunk {
        let chunk = Array(sampleBuffer.prefix(samplesPerChunk))
        sampleBuffer.removeFirst(samplesPerChunk)

        let rms = self.computeRMS(chunk)
        let db = rms > 0 ? 20.0 * log10(rms / 32768.0) : -160.0
        let timeMs = Double(totalMonoSamplesRead) / sampleRate * 1000.0

        results.append([
          "timeMs": timeMs,
          "volumeDb": db
        ])

        totalMonoSamplesRead += samplesPerChunk
      }
    }

    if !sampleBuffer.isEmpty {
      let rms = self.computeRMS(sampleBuffer)
      let db = rms > 0 ? 20.0 * log10(rms / 32768.0) : -160.0
      let timeMs = Double(totalMonoSamplesRead) / sampleRate * 1000.0
      results.append([
        "timeMs": timeMs,
        "volumeDb": db
      ])
    }

    return results
  }

  // MARK: - Face-masked skin smoothing

  private func performBeautify(videoUri: String, outputPath: String, intensity: Double) async throws -> [String: Any] {
    guard let fileURL = resolveFileURL(sourceUri: videoUri) else {
      throw VideoExportError.invalidClips("Not a local file URI: \(videoUri.prefix(80))")
    }
    let cleanPath = fileURL.path
    guard FileManager.default.fileExists(atPath: cleanPath) else {
      throw VideoExportError.invalidClips("File not found: \(cleanPath)")
    }

    let asset = AVAsset(url: fileURL)

    // Intensity 0..1 drives two parallel parameters:
    //   - blurRadius: how strong the tone-smoothing Gaussian is.
    //   - mixStrength: how much of the smoothed image we blend in inside the skin mask.
    // Splitting these lets us keep blur subtle while letting the user dial overall effect.
    //
    // Tuned DOWN from previous 0.55..0.90 mix: even with the median+Gaussian pipeline,
    // ~80% mix was reading as "blurred face" rather than "smoothed skin". 0.30..0.65
    // lands at a natural "polished" look at default intensity 0.7 — and matches the
    // Android shader's mix formula so both platforms feel the same.
    let clampedIntensity = max(0.0, min(1.0, intensity))
    let blurRadius = 3.0 + 7.0 * clampedIntensity   // 3..10 px @ source resolution
    let mixStrength = CGFloat(0.30 + 0.35 * clampedIntensity)  // 0.30..0.65

    // Shared CIContext: thread-safe and reusing it avoids re-uploading GPU state every frame.
    let ciContext = CIContext(options: nil)
    let videoTrack = asset.tracks(withMediaType: .video).first
    let visionOrientation = videoTrack.map { cgImageOrientation(for: $0.preferredTransform) } ?? .up

    // Pre-scan: confirm the video actually contains a face before paying the per-frame
    // Vision cost. If no faces appear in any sampled frame, we fall back to a gentle
    // whole-frame Gaussian — the user always sees an effect rather than a silent no-op
    // (matches the Android fallback behavior).
    let hasFaces = await detectAnyFaces(asset: asset)
    print("✨ [VideoExport] Beautify pre-scan: hasFaces=\(hasFaces)")

    let videoComposition = AVMutableVideoComposition(asset: asset, applyingCIFiltersWithHandler: { [weak self] request in
      let source = request.sourceImage
      let extent = source.extent

      // --- Fallback path: no faces in the video, blur the whole frame gently. ---
      // Tuned WAY down (0.25× instead of 0.5×) — anything stronger looks like a "blur
      // filter" applied to the whole scene. The user clicked smooth-skin, not "make my
      // video look out-of-focus."
      if !hasFaces {
        let fallback = source
          .applyingFilter("CIGaussianBlur", parameters: ["inputRadius": blurRadius * 0.25])
          .cropped(to: extent)
        request.finish(with: fallback, context: ciContext)
        return
      }

      // --- Preferred path: face-masked smoothing. ---
      // VNDetectFaceLandmarksRequest yields face contour, eyes, brows, and lips — enough to
      // build a tight mask that excludes features we don't want to smooth (eyes lose
      // sharpness, lip lines lose definition, etc.). All normalized coords use bottom-left
      // origin matching CoreImage, so no Y-flip is needed downstream.
      let landmarksRequest = VNDetectFaceLandmarksRequest()
      let visionHandler = VNImageRequestHandler(ciImage: source, orientation: visionOrientation, options: [:])
      try? visionHandler.perform([landmarksRequest])
      let observations = landmarksRequest.results ?? []

      // Per-frame face miss inside a video that DOES contain faces (e.g. subject turned
      // away momentarily): apply the same gentle fallback rather than emit raw source —
      // keeps the overall look consistent across the clip.
      if observations.isEmpty {
        let fallback = source
          .applyingFilter("CIGaussianBlur", parameters: ["inputRadius": blurRadius * 0.25])
          .cropped(to: extent)
        request.finish(with: fallback, context: ciContext)
        return
      }

      // Mask is built at half resolution: drawing into a CGContext is the cheapest way to
      // get arbitrary polygons/ellipses, and the subsequent feather hides the upscale.
      let featherRadius = max(10.0, min(extent.width, extent.height) * 0.035)
      guard let skinMask = self?.buildSkinMask(
        observations: observations,
        extent: extent,
        featherRadius: featherRadius,
        mixStrength: mixStrength
      ) else {
        request.finish(with: source, context: ciContext)
        return
      }

      // Two-stage smoothing approximates frequency separation without writing a custom kernel:
      //   1. CIMedianFilter is edge-preserving and kills small blemishes (pimples, pores)
      //      without smearing eyelashes or lip edges.
      //   2. CIGaussianBlur evens out remaining skin tone variation.
      // Applied to the whole frame, then blended back via the mask so only facial skin moves.
      let denoised = source.applyingFilter("CIMedianFilter")
      let smoothed = denoised
        .applyingFilter("CIGaussianBlur", parameters: ["inputRadius": blurRadius])
        .cropped(to: extent)

      let beautified = smoothed.applyingFilter("CIBlendWithMask", parameters: [
        "inputBackgroundImage": source,
        "inputMaskImage": skinMask
      ])

      request.finish(with: beautified, context: ciContext)
    })

    if let videoTrack {
      videoComposition.renderSize = getTransformedSize(for: videoTrack)
      let nominalFrameRate = videoTrack.nominalFrameRate
      if nominalFrameRate > 0 {
        videoComposition.frameDuration = CMTime(
          value: 1,
          timescale: CMTimeScale(max(1, Int32(nominalFrameRate.rounded())))
        )
      }
    }

    let cleanOutputPath = outputPath.replacingOccurrences(of: "file://", with: "")
    let outputURL = URL(fileURLWithPath: cleanOutputPath)
    if FileManager.default.fileExists(atPath: cleanOutputPath) {
      try? FileManager.default.removeItem(at: outputURL)
    }

    guard let exportSession = AVAssetExportSession(asset: asset, presetName: AVAssetExportPresetHighestQuality) else {
      throw VideoExportError.exportSessionError("Failed to create beautify export session")
    }

    exportSession.outputURL = outputURL
    exportSession.outputFileType = .mp4
    exportSession.videoComposition = videoComposition
    exportSession.shouldOptimizeForNetworkUse = true

    print("✨ [VideoExport] Beautify starting:")
    print("   - Source: \(cleanPath.components(separatedBy: "/").last ?? "unknown")")
    print("   - Intensity: \(clampedIntensity), blurRadius: \(blurRadius)px")
    print("   - Render size: \(videoComposition.renderSize)")

    return try await withCheckedThrowingContinuation { continuation in
      exportSession.exportAsynchronously {
        switch exportSession.status {
        case .completed:
          print("✅ [VideoExport] Beautify completed: \(cleanOutputPath)")
          continuation.resume(returning: [
            "path": cleanOutputPath,
            "success": true
          ])
        case .failed:
          let error = exportSession.error?.localizedDescription ?? "Unknown error"
          print("❌ [VideoExport] Beautify failed: \(error)")
          continuation.resume(throwing: VideoExportError.exportFailed(error))
        case .cancelled:
          continuation.resume(throwing: VideoExportError.exportCancelled)
        default:
          continuation.resume(throwing: VideoExportError.unknownError)
        }
      }
    }
  }

  private func computeRMS(_ samples: [Int16]) -> Double {
    guard !samples.isEmpty else { return 0 }
    let sumOfSquares = samples.reduce(0.0) { acc, sample in
      acc + Double(sample) * Double(sample)
    }
    return sqrt(sumOfSquares / Double(samples.count))
  }

  /// Samples a handful of frames from the asset and returns true if any contains a face.
  ///
  /// Uses `appliesPreferredTrackTransform = true` so the sampled CGImages are in display
  /// orientation, which lets us pass `.up` to Vision unambiguously regardless of how the
  /// source video was rotated. We use the cheaper `VNDetectFaceRectanglesRequest` here
  /// (no landmarks needed for the yes/no decision).
  private func detectAnyFaces(asset: AVAsset) async -> Bool {
    guard let duration = try? await asset.load(.duration) else { return false }
    let durationSeconds = CMTimeGetSeconds(duration)
    guard durationSeconds > 0 else { return false }

    let generator = AVAssetImageGenerator(asset: asset)
    generator.appliesPreferredTrackTransform = true
    generator.requestedTimeToleranceBefore = CMTime(value: 1, timescale: 4)
    generator.requestedTimeToleranceAfter = CMTime(value: 1, timescale: 4)

    let sampleCount = min(5, max(1, Int(durationSeconds.rounded())))
    let step = durationSeconds / Double(sampleCount)
    let times: [CMTime] = (0..<sampleCount).map { i in
      // Skip exact 0 and end-of-clip frames which sometimes decode to garbage.
      let t = max(0.05, (Double(i) + 0.5) * step - durationSeconds * 0.05)
      return CMTime(seconds: min(durationSeconds - 0.05, t), preferredTimescale: 600)
    }

    for time in times {
      guard let cgImage = try? generator.copyCGImage(at: time, actualTime: nil) else { continue }
      let request = VNDetectFaceRectanglesRequest()
      let handler = VNImageRequestHandler(cgImage: cgImage, orientation: .up, options: [:])
      do {
        try handler.perform([request])
        if let results = request.results, !results.isEmpty {
          return true
        }
      } catch {
        continue
      }
    }
    return false
  }

  // MARK: - Skin mask construction

  /// Builds a grayscale mask whose white regions mark skin we want to smooth.
  ///
  /// Strategy:
  ///   1. Draw an elliptical fill for each face's bounding box (slight expansion for forehead).
  ///   2. Subtract elliptical cutouts at each landmark feature we want to keep crisp
  ///      (eyes, eyebrows, lips). Nose stays in the mask because nose skin should smooth.
  ///   3. Render at half resolution — the feather pass after upscaling hides any pixelation.
  ///   4. Multiply by `mixStrength` so the strongest blend at the mask center is sub-1.0,
  ///      which prevents the "porcelain" look at high intensity.
  ///   5. Feather with a Gaussian so the smoothed area fades smoothly into the original.
  private func buildSkinMask(
    observations: [VNFaceObservation],
    extent: CGRect,
    featherRadius: Double,
    mixStrength: CGFloat
  ) -> CIImage? {
    let scaleFactor: CGFloat = 0.5
    let maskWidth = max(1, Int(extent.width * scaleFactor))
    let maskHeight = max(1, Int(extent.height * scaleFactor))

    let colorSpace = CGColorSpaceCreateDeviceGray()
    guard let context = CGContext(
      data: nil,
      width: maskWidth,
      height: maskHeight,
      bitsPerComponent: 8,
      bytesPerRow: 0,
      space: colorSpace,
      bitmapInfo: CGImageAlphaInfo.none.rawValue
    ) else { return nil }

    context.setAllowsAntialiasing(true)
    context.setShouldAntialias(true)

    // Black background = original pixels untouched everywhere by default.
    context.setFillColor(gray: 0.0, alpha: 1.0)
    context.fill(CGRect(x: 0, y: 0, width: maskWidth, height: maskHeight))

    // White ellipses: where we'll smooth. Slight expansion vertically to cover forehead
    // (Vision's box clips at the hairline). Horizontal expansion is minimal so we don't
    // bleed into ears / hair beside the face.
    context.setFillColor(gray: 1.0, alpha: 1.0)
    for observation in observations {
      let bbox = observation.boundingBox
      let faceRect = CGRect(
        x: bbox.minX * CGFloat(maskWidth),
        y: bbox.minY * CGFloat(maskHeight),
        width: bbox.width * CGFloat(maskWidth),
        height: bbox.height * CGFloat(maskHeight)
      )
      let expanded = faceRect.insetBy(
        dx: -faceRect.width * 0.04,
        dy: -faceRect.height * 0.10
      )
      context.fillEllipse(in: expanded)
    }

    // Black feature cutouts. Each landmark region returns normalized points within the face
    // bounding box; we compute their AABB and over-pad slightly so the feather doesn't bleed
    // smoothing back into the feature edges.
    context.setFillColor(gray: 0.0, alpha: 1.0)
    for observation in observations {
      guard let landmarks = observation.landmarks else { continue }
      let bbox = observation.boundingBox
      let faceOffsetX = bbox.minX * CGFloat(maskWidth)
      let faceOffsetY = bbox.minY * CGFloat(maskHeight)
      let faceWidth = bbox.width * CGFloat(maskWidth)
      let faceHeight = bbox.height * CGFloat(maskHeight)

      func carveOut(_ region: VNFaceLandmarkRegion2D?, padX: CGFloat, padY: CGFloat) {
        guard let region = region, region.pointCount > 0 else { return }
        let xs = region.normalizedPoints.map { faceOffsetX + $0.x * faceWidth }
        let ys = region.normalizedPoints.map { faceOffsetY + $0.y * faceHeight }
        guard let minX = xs.min(), let maxX = xs.max(),
              let minY = ys.min(), let maxY = ys.max() else { return }
        let width = max(1.0, maxX - minX)
        let height = max(1.0, maxY - minY)
        let rect = CGRect(x: minX, y: minY, width: width, height: height)
        let padded = rect.insetBy(dx: -width * padX, dy: -height * padY)
        context.fillEllipse(in: padded)
      }

      // Pads tuned to comfortably cover lashes / brow hair / lip edges in the feature ellipse.
      carveOut(landmarks.leftEye, padX: 0.35, padY: 0.7)
      carveOut(landmarks.rightEye, padX: 0.35, padY: 0.7)
      carveOut(landmarks.leftEyebrow, padX: 0.15, padY: 0.6)
      carveOut(landmarks.rightEyebrow, padX: 0.15, padY: 0.6)
      carveOut(landmarks.outerLips, padX: 0.08, padY: 0.35)
    }

    guard let cgImage = context.makeImage() else { return nil }

    // Upscale to source resolution. CIAffineTransform uses bilinear, which combined with the
    // feather Gaussian below yields visibly smooth edges.
    let scale = 1.0 / scaleFactor
    var mask = CIImage(cgImage: cgImage)
      .transformed(by: CGAffineTransform(scaleX: scale, y: scale))

    // Feather the mask edges so smoothing fades into the original instead of cutting hard.
    mask = mask
      .applyingFilter("CIGaussianBlur", parameters: ["inputRadius": featherRadius])
      .cropped(to: extent)

    // Scale mask luminance by intensity so peak smoothing is capped (CIBlendWithMask uses
    // luminance as alpha). Using CIColorMatrix to scale the alpha-like luma channel.
    if mixStrength < 0.999 {
      let scaleVec = CIVector(x: mixStrength, y: 0, z: 0, w: 0)
      mask = mask.applyingFilter("CIColorMatrix", parameters: [
        "inputRVector": scaleVec,
        "inputGVector": CIVector(x: 0, y: mixStrength, z: 0, w: 0),
        "inputBVector": CIVector(x: 0, y: 0, z: mixStrength, w: 0),
        "inputAVector": CIVector(x: 0, y: 0, z: 0, w: 1),
        "inputBiasVector": CIVector(x: 0, y: 0, z: 0, w: 0)
      ])
    }

    return mask
  }

  // MARK: - Helper Methods

  /// Resolves a sourceUri (file:// or absolute path) to a file URL. Returns nil for remote (http/https) URIs.
  private func resolveFileURL(sourceUri: String) -> URL? {
    let trimmed = sourceUri.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else { return nil }
    // Reject remote URLs — they must be downloaded first and passed as a local path/URI
    if trimmed.lowercased().hasPrefix("http://") || trimmed.lowercased().hasPrefix("https://") {
      return nil
    }
    if trimmed.hasPrefix("file://") {
      guard let url = URL(string: trimmed) else { return nil }
      return url.standardizedFileURL
    }
    // Bare absolute path (e.g. from expo-file-system File.uri without scheme)
    let url = URL(fileURLWithPath: trimmed)
    return url.standardizedFileURL
  }

  /// Get the final size of a video after applying its preferred transform
  private func getTransformedSize(for videoTrack: AVAssetTrack) -> CGSize {
    let naturalSize = videoTrack.naturalSize
    let transform = videoTrack.preferredTransform

    // Apply transform to get the actual visible size
    let transformedRect = CGRect(origin: .zero, size: naturalSize).applying(transform)
    return CGSize(width: abs(transformedRect.width), height: abs(transformedRect.height))
  }

  private func cgImageOrientation(for transform: CGAffineTransform) -> CGImagePropertyOrientation {
    if transform.a == 0 && transform.b == 1.0 && transform.c == -1.0 && transform.d == 0 {
      return .right
    }
    if transform.a == 0 && transform.b == -1.0 && transform.c == 1.0 && transform.d == 0 {
      return .left
    }
    if transform.a == -1.0 && transform.b == 0 && transform.c == 0 && transform.d == -1.0 {
      return .down
    }
    return .up
  }

  /// Calculate the final transform for a video track, handling rotation, scaling, and optional crop
  private func calculateFinalTransform(
    videoTrack: AVAssetTrack,
    renderSize: CGSize,
    crop: [String: Any]?
  ) -> CGAffineTransform {
    let naturalSize = videoTrack.naturalSize
    let preferredTransform = videoTrack.preferredTransform

    // Determine orientation from transform matrix
    // Standard iOS video transforms:
    // - 0°:   a=1,  b=0,  c=0,  d=1  (landscape)
    // - 90°:  a=0,  b=1,  c=-1, d=0  (portrait, rotated clockwise)
    // - -90°: a=0,  b=-1, c=1,  d=0  (portrait, rotated counter-clockwise)
    // - 180°: a=-1, b=0,  c=0,  d=-1 (upside down)

    var rotationTransform: CGAffineTransform
    var isRotated = false

    let a = preferredTransform.a
    let b = preferredTransform.b
    let c = preferredTransform.c
    let d = preferredTransform.d

    if a == 0 && b == 1 && c == -1 && d == 0 {
      // 90° clockwise rotation - common for portrait videos
      rotationTransform = CGAffineTransform(translationX: naturalSize.height, y: 0)
        .rotated(by: .pi / 2)
      isRotated = true
    } else if a == 0 && b == -1 && c == 1 && d == 0 {
      // 90° counter-clockwise rotation
      rotationTransform = CGAffineTransform(translationX: 0, y: naturalSize.width)
        .rotated(by: -.pi / 2)
      isRotated = true
    } else if a == -1 && b == 0 && c == 0 && d == -1 {
      // 180° rotation
      rotationTransform = CGAffineTransform(translationX: naturalSize.width, y: naturalSize.height)
        .rotated(by: .pi)
      isRotated = false
    } else {
      // No rotation needed (landscape) or unknown transform - use identity
      rotationTransform = .identity
      isRotated = false
    }

    // Calculate video size after rotation
    let videoSize = isRotated
      ? CGSize(width: naturalSize.height, height: naturalSize.width)
      : naturalSize

    // Calculate scale to fill render size (aspect-fill: scale to fill, may crop edges)
    let scaleX = renderSize.width / videoSize.width
    let scaleY = renderSize.height / videoSize.height
    let baseScale = max(scaleX, scaleY)

    // Future: Per-clip zoom can be applied here
    // let userZoom = clipData["zoom"] as? Double ?? 1.0
    // let scale = baseScale * userZoom
    let scale = baseScale

    // Calculate centering offset
    let scaledVideoWidth = videoSize.width * scale
    let scaledVideoHeight = videoSize.height * scale
    let offsetX = (renderSize.width - scaledVideoWidth) / 2.0
    let offsetY = (renderSize.height - scaledVideoHeight) / 2.0

    // Build final transform: rotate -> scale -> translate to center.
    //
    // Order matters. `rotationTransform` carries a translation in SOURCE pixels
    // (naturalSize.height / .width) to bring the rotated frame back into positive
    // coordinates. Scaling before the rotation leaves that translation unscaled, so the
    // frame lands `naturalSize.height` away from the origin instead of
    // `naturalSize.height * scale` — pushing the video off the canvas by
    // (1 - scale) * naturalSize.height.
    //
    // That was invisible while renderSize always equalled the source size (scale == 1).
    // Once capRenderSize started downscaling to the requested ceiling, a 4K portrait
    // capture exported at 2K (scale = 2/3) rendered with half the frame black and half
    // the video cut off; at 1080p (scale = 1/2) the frame went fully black.
    //
    // Rotating first keeps the translation in the same space it was computed in, so the
    // scale then applies to the whole rotated frame and the result always spans exactly
    // [0, videoSize * scale] before centering.
    var finalTransform = rotationTransform
    finalTransform = finalTransform.concatenating(CGAffineTransform(scaleX: scale, y: scale))
    finalTransform = finalTransform.concatenating(CGAffineTransform(translationX: offsetX, y: offsetY))

    // Apply crop if specified and not default (full frame)
    if let cropData = crop {
      let x = cropData["x"] as? Double ?? 0
      let y = cropData["y"] as? Double ?? 0
      let width = cropData["width"] as? Double ?? 100
      let height = cropData["height"] as? Double ?? 100

      // Only apply crop transform if it's not the default full-frame crop
      if x != 0 || y != 0 || width != 100 || height != 100 {
        let cropScaleX = 100.0 / width
        let cropScaleY = 100.0 / height
        let translateX = -(x * renderSize.width / 100.0) * cropScaleX
        let translateY = -(y * renderSize.height / 100.0) * cropScaleY

        let cropTransform = CGAffineTransform(scaleX: cropScaleX, y: cropScaleY)
          .translatedBy(x: translateX, y: translateY)

        finalTransform = finalTransform.concatenating(cropTransform)
      }
    }

    return finalTransform
  }

  /// Longest/shortest edge allowed for a resolution key, orientation-agnostic.
  private func resolutionBounds(_ resolution: String) -> (long: CGFloat, short: CGFloat)? {
    switch resolution {
    case "720p": return (1280, 720)
    case "1080p": return (1920, 1080)
    case "2k": return (2560, 1440)
    case "4k": return (3840, 2160)
    default: return nil
    }
  }

  /// Fits `size` inside the resolution's bounds, preserving aspect ratio.
  ///
  /// Never scales *up*: a 1080p capture asked for 2K stays 1080p rather than being stretched
  /// into a larger container, which would add file size and advertise detail that was never
  /// recorded. Dimensions are rounded to even numbers because H.264 requires it.
  private func capRenderSize(_ size: CGSize, to resolution: String) -> CGSize {
    guard size.width > 0, size.height > 0, let bounds = resolutionBounds(resolution) else {
      return size
    }

    let long = max(size.width, size.height)
    let short = min(size.width, size.height)
    let scale = min(bounds.long / long, bounds.short / short, 1.0)
    if scale >= 1.0 { return size }

    let even: (CGFloat) -> CGFloat = { max(2, (($0 * scale) / 2).rounded() * 2) }
    return CGSize(width: even(size.width), height: even(size.height))
  }

  private func getExportPreset(quality: String, resolution: String, isPortrait: Bool) -> String {
    // For portrait videos, use quality-based presets that maintain aspect ratio
    // Fixed resolution presets (1920x1080, etc.) are designed for landscape
    if isPortrait {
      switch quality {
      case "high":
        return AVAssetExportPresetHighestQuality
      case "medium":
        return AVAssetExportPresetMediumQuality
      case "low":
        return AVAssetExportPresetLowQuality
      default:
        return AVAssetExportPresetHighestQuality
      }
    }

    // For landscape videos, use resolution-based presets
    switch resolution {
    case "4k":
      return AVAssetExportPreset3840x2160
    case "2k":
      // AVFoundation ships no 2560x1440 preset, and a fixed-size preset would clamp the
      // composition back down. HighestQuality honours videoComposition.renderSize, which
      // capRenderSize has already set to the 2K bounds.
      return AVAssetExportPresetHighestQuality
    case "1080p":
      return AVAssetExportPreset1920x1080
    case "720p":
      return AVAssetExportPreset1280x720
    default:
      return AVAssetExportPreset1920x1080
    }
  }

  private func getResolutionSize(_ resolution: String) -> CGSize {
    switch resolution {
    case "4k":
      return CGSize(width: 3840, height: 2160)
    case "2k":
      return CGSize(width: 2560, height: 1440)
    case "1080p":
      return CGSize(width: 1920, height: 1080)
    case "720p":
      return CGSize(width: 1280, height: 720)
    default:
      return CGSize(width: 1920, height: 1080)
    }
  }
}

// MARK: - Error Types

enum VideoExportError: Error, LocalizedError {
  case invalidClips(String)
  case trackError(String)
  case exportSessionError(String)
  case exportFailed(String)
  case exportCancelled
  case unknownError

  var errorDescription: String? {
    switch self {
    case .invalidClips(let msg): return "Invalid clips: \(msg)"
    case .trackError(let msg): return "Track error: \(msg)"
    case .exportSessionError(let msg): return "Export session error: \(msg)"
    case .exportFailed(let msg): return "Export failed: \(msg)"
    case .exportCancelled: return "Export cancelled"
    case .unknownError: return "Unknown error"
    }
  }
}
