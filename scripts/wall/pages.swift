// The cleaner's WebKit check (0.3-P3-fix2 O-1), from the second input review's probe (lab/review-board/evidence/0.3-P3/
// inputs-review-2/harness/wk.swift): a WKWebView in an off-screen window of an app that never activates, the engine the
// desktop cleans pages with.
//   clean: loads run.url (the cleaner page over http), calls exportPage(src, scripts) for each page, prints {id, html}.
//   open:  opens each file (file: by loadFileURL, or http) in a fresh WKWebView, logs every navigation it asks for,
//          waits run.wait seconds, prints {id, href, navs, held}.
import Cocoa
import WebKit
struct Page: Codable { var id: String; var src: String?; var scripts: Bool?; var file: String?; var url: String? }
struct Run: Codable { var mode: String; var url: String?; var pages: [Page]; var wait: Double?; var dir: String?; var held: String? }
let run = try! JSONDecoder().decode(Run.self, from: Data(contentsOf: URL(fileURLWithPath: CommandLine.arguments[1])))
func out(_ d: [String: Any]) { let j = try! JSONSerialization.data(withJSONObject: d); print(String(data: j, encoding: .utf8)!); fflush(stdout) }
class Nav: NSObject, WKNavigationDelegate {
  var navs: [String] = []; var loaded: (() -> Void)?
  func webView(_ w: WKWebView, decidePolicyFor a: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
    navs.append("\(a.targetFrame?.isMainFrame ?? false ? "main" : "sub"):\(a.request.url?.absoluteString.prefix(200) ?? "")"); decisionHandler(.allow)
  }
  func webView(_ w: WKWebView, didFinish n: WKNavigation!) { let l = loaded; loaded = nil; l?() }
  func webView(_ w: WKWebView, didFail n: WKNavigation!, withError e: Error) { navs.append("fail:\(e.localizedDescription)") }
  func webView(_ w: WKWebView, didFailProvisionalNavigation n: WKNavigation!, withError e: Error) { navs.append("provfail:\(e.localizedDescription)"); let l = loaded; loaded = nil; l?() }
}
let app = NSApplication.shared
app.setActivationPolicy(.prohibited)
var keep: [AnyObject] = []
func makeView() -> (WKWebView, Nav) {
  let conf = WKWebViewConfiguration(); conf.websiteDataStore = WKWebsiteDataStore.nonPersistent()
  let win = NSWindow(contentRect: NSRect(x: -10000, y: -10000, width: 900, height: 700), styleMask: [.borderless], backing: .buffered, defer: false)
  let web = WKWebView(frame: win.contentView!.bounds, configuration: conf); win.contentView!.addSubview(web); win.orderBack(nil)
  let nav = Nav(); web.navigationDelegate = nav; keep.append(win); keep.append(web); keep.append(nav)
  return (web, nav)
}
func cleanAll() {
  let (web, nav) = makeView()
  nav.loaded = {
    func one(_ i: Int) {
      if i >= run.pages.count { out(["done": true]); exit(0) }
      let p = run.pages[i]
      web.callAsyncJavaScript(run.mode == "eval" ? (p.src ?? "") : "for (let k = 0; k < 100 && typeof window.exportPage !== 'function'; k++) await new Promise(r => setTimeout(r, 100)); return await exportPage(src, scripts)", arguments: run.mode == "eval" ? [:] : ["src": p.src ?? "", "scripts": p.scripts ?? false], in: nil, in: .page) { r in
        switch r { case .success(let v): out(["id": p.id, "html": "\(v ?? "")"]); case .failure(let e): out(["id": p.id, "error": "\(e)"]) }
        one(i + 1)
      }
    }
    one(0)
  }
  web.load(URLRequest(url: URL(string: run.url!)!))
}
func openAll(_ i: Int) {
  if i >= run.pages.count { out(["done": true]); exit(0) }
  let p = run.pages[i]
  let (web, nav) = makeView()
  out(["start": p.id, "t": Date().timeIntervalSince1970])
  var finished = false
  let finish = {
    if finished { return }; finished = true
    web.evaluateJavaScript("JSON.stringify({href: location.href, held: (\(run.held ?? "[]")), text: (document.body ? document.body.innerText : '').slice(0, 200)})") { v, e in
      out(["id": p.id, "navs": nav.navs, "read": (v as? String) ?? "ERR \(String(describing: e))", "t": Date().timeIntervalSince1970])
      web.stopLoading(); web.loadHTMLString("", baseURL: nil)
      DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { openAll(i + 1) }
    }
  }
  nav.loaded = { DispatchQueue.main.asyncAfter(deadline: .now() + (run.wait ?? 2)) { finish() } }
  DispatchQueue.main.asyncAfter(deadline: .now() + (run.wait ?? 2) + 8) { finish() }
  if let f = p.file { let u = URL(fileURLWithPath: f); web.loadFileURL(u, allowingReadAccessTo: URL(fileURLWithPath: run.dir ?? u.deletingLastPathComponent().path)) }
  else { web.load(URLRequest(url: URL(string: p.url!)!)) }
}
DispatchQueue.main.async { if run.mode == "clean" || run.mode == "eval" { cleanAll() } else { openAll(0) } }
DispatchQueue.main.asyncAfter(deadline: .now() + 1500) { out(["timeout": true]); exit(2) }
app.run()
