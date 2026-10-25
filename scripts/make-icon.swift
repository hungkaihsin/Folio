import AppKit
let side = 1024
let image = NSImage(size: NSSize(width:side,height:side))
image.lockFocus()
NSColor(calibratedRed:0.16,green:0.34,blue:0.83,alpha:1).setFill()
NSBezierPath(roundedRect:NSRect(x:32,y:32,width:960,height:960),xRadius:210,yRadius:210).fill()
let attrs:[NSAttributedString.Key:Any] = [.font:NSFont.systemFont(ofSize:690,weight:.semibold),.foregroundColor:NSColor.white]
let text="F" as NSString
let size=text.size(withAttributes:attrs)
text.draw(at:NSPoint(x:(1024-size.width)/2-5,y:(1024-size.height)/2+20),withAttributes:attrs)
image.unlockFocus()
let rep=NSBitmapImageRep(data:image.tiffRepresentation!)!
try rep.representation(using:.png,properties:[:])!.write(to:URL(fileURLWithPath:"work/icon.png"))
