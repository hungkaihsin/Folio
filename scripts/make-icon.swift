import AppKit
import Foundation

// Render the same vector geometry used by the SVG mark at each native icon size.
let root = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
let design = try JSONSerialization.jsonObject(with: Data(contentsOf: root.appendingPathComponent("build/icon-design.json"))) as! [String: Any]
let shapes = design["paths"] as! [[String: Any]]
func color(_ hex: String) -> NSColor {
    let value = UInt32(hex.dropFirst(), radix: 16)!
    return NSColor(srgbRed: Double((value >> 16) & 255) / 255, green: Double((value >> 8) & 255) / 255, blue: Double(value & 255) / 255, alpha: 1)
}
func render(_ size: Int) -> Data {
    let bitmap = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: size, pixelsHigh: size, bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
    let context = NSGraphicsContext(bitmapImageRep: bitmap)!
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = context
    context.cgContext.clear(CGRect(x: 0, y: 0, width: size, height: size))
    context.cgContext.translateBy(x: 0, y: Double(size))
    context.cgContext.scaleBy(x: Double(size) / 1024, y: -Double(size) / 1024)
    color(design["background"] as! String).setFill()
    NSBezierPath(roundedRect: NSRect(x: 32, y: 32, width: 960, height: 960), xRadius: 210, yRadius: 210).fill()
    for shape in shapes {
        let path = NSBezierPath()
        path.windingRule = .evenOdd
        for command in shape["commands"] as! [[Any]] {
            let values = command.dropFirst().map { ($0 as! NSNumber).doubleValue }
            switch command[0] as! String {
            case "M": path.move(to: NSPoint(x: values[0], y: values[1]))
            case "L": path.line(to: NSPoint(x: values[0], y: values[1]))
            case "C": path.curve(to: NSPoint(x: values[4], y: values[5]), controlPoint1: NSPoint(x: values[0], y: values[1]), controlPoint2: NSPoint(x: values[2], y: values[3]))
            case "Z": path.close()
            default: fatalError("Unknown path command")
            }
        }
        color(shape["fill"] as! String).setFill()
        path.fill()
    }
    NSGraphicsContext.restoreGraphicsState()
    return bitmap.representation(using: .png, properties: [:])!
}
let frames = root.appendingPathComponent("work/pageline-icon-frames")
try FileManager.default.createDirectory(at: frames, withIntermediateDirectories: true)
for size in [16, 24, 32, 48, 64, 128, 256, 512, 1024] {
    try render(size).write(to: frames.appendingPathComponent("\(size).png"))
}
