// verify:wall's measurer (0.3-P2-fix3): one WKWebView in a window parked off every display, in an app
// that never activates, the same engine the desktop draws free pages with. It loads one address, puts
// the page wall in (the settings named in src-tauri/page-wall.json, called the way src-tauri/src/
// page_wall.rs calls them: asked for first, never set by key), runs the steps it is given, and prints
// one JSON line per thing it learns. It reaches nothing but the loopback servers verify-wall.mjs runs.
//
//   swiftc -O scripts/wall/measure.swift -o <somewhere untracked>/measure && measure <run.json>
import Cocoa
import WebKit

struct Wall: Codable { var peerConnection: Pair; var mediaDevices: Pair; var features: [String]; var featureList: String; var featureKey: String; var featureSetter: String; var featureGetter: String }
struct Pair: Codable { var setter: String; var getter: String }
struct Step: Codable { var js: String?; var wait: Double?; var read: String? }
struct Run: Codable { var url: String; var wall: String?; var when: String?; var schemes: [String: String]?; var steps: [Step]; var delegate: String? }
let run = try! JSONDecoder().decode(Run.self, from: Data(contentsOf: URL(fileURLWithPath: CommandLine.arguments[1])))
func out(_ d: [String: Any]) { let j = try! JSONSerialization.data(withJSONObject: d); print(String(data: j, encoding: .utf8)!); fflush(stdout) }

typealias SetBool = @convention(c) (AnyObject, Selector, Bool) -> Void
typealias GetBool = @convention(c) (AnyObject, Selector) -> Bool
typealias SetFeature = @convention(c) (AnyObject, Selector, Bool, AnyObject) -> Void
typealias GetFeature = @convention(c) (AnyObject, Selector, AnyObject) -> Bool
typealias GetObject = @convention(c) (AnyObject, Selector) -> AnyObject?

/// One setting with a setter and a getter, as page_wall.rs puts it: asked for first, then off, then read back.
var before: [String: Bool] = [:]
func pairOff(_ p: WKPreferences, _ pair: Pair) -> String {
  let set = Selector(pair.setter), get = Selector(pair.getter)
  guard p.responds(to: set), p.responds(to: get), let ms = class_getInstanceMethod(type(of: p), set), let mg = class_getInstanceMethod(type(of: p), get) else { return "unavailable" }
  // What this WebKit had before the wall, for the record: whether a page would have had the setting at all.
  before[pair.getter] = unsafeBitCast(method_getImplementation(mg), to: GetBool.self)(p, get)
  unsafeBitCast(method_getImplementation(ms), to: SetBool.self)(p, set, false)
  return unsafeBitCast(method_getImplementation(mg), to: GetBool.self)(p, get) ? "on" : "off"
}

/// The page wall, as page_wall.rs puts it: each setting only when the engine says it has it, then read back.
func putWall(_ p: WKPreferences, _ wall: Wall) -> [String: String] {
  var status: [String: String] = ["rtc": pairOff(p, wall.peerConnection), "preconnect": "unavailable", "capture": pairOff(p, wall.mediaDevices)]
  let list = Selector(wall.featureList), key = Selector(wall.featureKey), fset = Selector(wall.featureSetter), fget = Selector(wall.featureGetter)
  if WKPreferences.responds(to: list), p.responds(to: fset), p.responds(to: fget), let m = class_getClassMethod(WKPreferences.self, list),
     let features = unsafeBitCast(method_getImplementation(m), to: GetObject.self)(WKPreferences.self, list) as? [NSObject] {
    var states: [String] = []
    for name in wall.features {
      guard let feature = features.first(where: { $0.responds(to: key) && ($0.perform(key)?.takeUnretainedValue() as? String) == name }),
            let ms = class_getInstanceMethod(type(of: p), fset), let mg = class_getInstanceMethod(type(of: p), fget) else { states.append("unavailable"); continue }
      unsafeBitCast(method_getImplementation(ms), to: SetFeature.self)(p, fset, false, feature)
      states.append(unsafeBitCast(method_getImplementation(mg), to: GetFeature.self)(p, fget, feature) ? "on" : "off")
    }
    status["preconnect"] = states.contains("unavailable") ? "unavailable" : states.contains("on") ? "on" : "off"
  }
  out(["before": before])
  return status
}

class Proxy: NSObject, WKURLSchemeHandler {
  let base: String; var stopped = Set<ObjectIdentifier>()
  init(_ b: String) { base = b }
  func webView(_ w: WKWebView, start task: WKURLSchemeTask) {
    let u = task.request.url!
    var path = u.path; if let q = u.query { path += "?" + q }
    let id = ObjectIdentifier(task)
    var rq = URLRequest(url: URL(string: base + path)!); rq.httpMethod = task.request.httpMethod ?? "GET"; rq.cachePolicy = .reloadIgnoringLocalCacheData; for (k, v) in task.request.allHTTPHeaderFields ?? [:] { rq.setValue(v, forHTTPHeaderField: k) }
    URLSession.shared.dataTask(with: rq) { data, resp, err in
      DispatchQueue.main.async {
        if self.stopped.contains(id) { return }
        guard let r = resp as? HTTPURLResponse else { task.didFailWithError(err ?? NSError(domain: "wall", code: 1)); return }
        // Only the headers the server meant, not its connection's own: Tauri's asset protocol sends none of those.
        var h: [String: String] = [:]; for (k, v) in r.allHeaderFields where !["connection", "keep-alive", "date", "transfer-encoding"].contains(String(describing: k).lowercased()) { h[String(describing: k)] = String(describing: v) }
        task.didReceive(HTTPURLResponse(url: u, statusCode: r.statusCode, httpVersion: "HTTP/1.1", headerFields: h)!)
        task.didReceive(data ?? Data()); task.didFinish()
      }
    }.resume()
  }
  func webView(_ w: WKWebView, stop task: WKURLSchemeTask) { stopped.insert(ObjectIdentifier(task)) }
}

/// The app's window answers a page's request for the camera or the microphone the way wry 0.55 does: it grants
/// every one (wry_web_view_ui_delegate.rs). This one answers as it is told, and says each time it is asked.
class UI: NSObject, WKUIDelegate {
  @available(macOS 12.0, *)
  func webView(_ w: WKWebView, requestMediaCapturePermissionFor origin: WKSecurityOrigin, initiatedByFrame frame: WKFrameInfo, type: WKMediaCaptureType, decisionHandler: @escaping (WKPermissionDecision) -> Void) {
    out(["delegate": ["origin": "\(origin.protocol)://\(origin.host):\(origin.port)", "mainFrame": frame.isMainFrame, "type": type.rawValue, "answer": run.delegate ?? "deny"]])
    decisionHandler(run.delegate == "grant" ? .grant : .deny)
  }
}
let ui = UI()
let wall: Wall? = run.wall.map { try! JSONDecoder().decode(Wall.self, from: Data(contentsOf: URL(fileURLWithPath: $0))) }
class Nav: NSObject, WKNavigationDelegate {
  var done = false
  func finish(_ w: WKWebView) {
    if done { return }; done = true
    if run.when == "afterLoad", let wall = wall { out(["wall": putWall(w.configuration.preferences, wall), "when": "afterLoad"]) }
    step(w, 0)
  }
  func webView(_ w: WKWebView, didFinish n: WKNavigation!) { finish(w) }
  func webView(_ w: WKWebView, didFailProvisionalNavigation n: WKNavigation!, withError e: Error) { out(["navError": e.localizedDescription]); finish(w) }
  func step(_ w: WKWebView, _ i: Int) {
    if i >= run.steps.count { out(["done": true]); exit(0) }
    let s = run.steps[i]
    let next = {
      DispatchQueue.main.asyncAfter(deadline: .now() + (s.wait ?? 0)) {
        if let r = s.read { w.evaluateJavaScript(r) { v, e in out(["step": i, "read": v.map { "\($0)" } ?? "ERR \(String(describing: e))"]); self.step(w, i + 1) } }
        else { self.step(w, i + 1) }
      }
    }
    if let js = s.js { w.evaluateJavaScript(js) { _, e in if let e = e { out(["step": i, "jsError": "\(e)"]) }; next() } } else { next() }
  }
}

let app = NSApplication.shared
app.setActivationPolicy(.prohibited)
let nav = Nav()
var keep: [AnyObject] = []
DispatchQueue.main.async {
  let conf = WKWebViewConfiguration()
  conf.websiteDataStore = WKWebsiteDataStore.nonPersistent()
  for (scheme, base) in run.schemes ?? [:] { let h = Proxy(base); keep.append(h); conf.setURLSchemeHandler(h, forURLScheme: scheme) }
  conf.userContentController.addUserScript(WKUserScript(source: "window.__m=[];addEventListener('message',e=>window.__m.push(e.data));", injectionTime: .atDocumentStart, forMainFrameOnly: true))
  let win = NSWindow(contentRect: NSRect(x: -10000, y: -10000, width: 900, height: 700), styleMask: [.borderless], backing: .buffered, defer: false)
  let web = WKWebView(frame: win.contentView!.bounds, configuration: conf)
  win.contentView!.addSubview(web); win.orderBack(nil); keep.append(win); keep.append(web)
  // A request for the camera or the microphone waits until the window has the focus, which this one never
  // does; the app's window does while the person uses it, so requests are answered here as they are there.
  let focus = Selector(("_setGetUserMediaRequiresFocus:"))
  if web.configuration.preferences.responds(to: focus), let m = class_getInstanceMethod(WKPreferences.self, focus) { unsafeBitCast(method_getImplementation(m), to: SetBool.self)(web.configuration.preferences, focus, false) }
  if run.delegate != nil { web.uiDelegate = ui }
  if run.when == "afterCreate", let wall = wall { out(["wall": putWall(web.configuration.preferences, wall), "when": "afterCreate"]) }
  web.navigationDelegate = nav
  web.load(URLRequest(url: URL(string: run.url)!))
}
DispatchQueue.main.asyncAfter(deadline: .now() + 60) { out(["timeout": true]); exit(2) }
app.run()
