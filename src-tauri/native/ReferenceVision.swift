import Foundation
import Vision
import ImageIO

// Local raster -> text evidence. No networking, generation, or instruction execution.
do {
    guard CommandLine.arguments.count == 3 else { throw NSError(domain: "Arguments", code: 1) }
    let url = URL(fileURLWithPath: CommandLine.arguments[1])
    guard let source = CGImageSourceCreateWithURL(url as CFURL, nil),
          let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
          let width = properties[kCGImagePropertyPixelWidth] as? Int,
          let height = properties[kCGImagePropertyPixelHeight] as? Int,
          width > 0, height > 0, width <= 20000, height <= 20000, width * height <= 40_000_000
    else { throw NSError(domain: "Image", code: 2) }
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.usesLanguageCorrection = true
    let supported = try request.supportedRecognitionLanguages()
    request.recognitionLanguages = ["en-US", "ko-KR"].filter { supported.contains($0) }
    try VNImageRequestHandler(url: url).perform([request])
    let lines: [[String: Any]] = (request.results ?? []).prefix(200).compactMap { observation in
        guard let candidate = observation.topCandidates(1).first else { return nil }
        let box = observation.boundingBox
        return ["text": String(candidate.string.prefix(2000)), "confidence": candidate.confidence,
                "x": box.minX, "y": 1 - box.maxY, "width": box.width, "height": box.height]
    }
    let result: [String: Any] = ["lines": lines, "width": width, "height": height, "engine": "Apple Vision"]
    try JSONSerialization.data(withJSONObject: result).write(to: URL(fileURLWithPath: CommandLine.arguments[2]), options: .atomic)
} catch {
    fputs("Reference OCR failed: \(error.localizedDescription)\n", stderr)
    exit(1)
}
