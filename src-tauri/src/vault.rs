use base64::{engine::general_purpose::STANDARD, Engine};
use serde_json::{json, Value};
use std::{
    fs,
    io::{Read, Write},
    path::{Path, PathBuf},
    time::SystemTime,
};
use tauri::Manager;

// A prune must never observe another worker building an unpublished snapshot.
static SNAPSHOTS: std::sync::Mutex<()> = std::sync::Mutex::new(());

const KEEP_SNAPSHOTS: usize = 5;

fn segment(s: &str) -> Result<(), String> {
    if s.is_empty()
        || s.len() > 100
        || !s
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_' || b == b'.')
        || s.starts_with('.')
        || s.contains("..")
    {
        Err("Invalid file identifier".into())
    } else {
        Ok(())
    }
}
fn safe_child(root: &Path, name: &str) -> Result<PathBuf, String> {
    segment(name)?;
    let p = root.join(name);
    if let Ok(m) = fs::symlink_metadata(&p) {
        if m.file_type().is_symlink() {
            return Err("Symlink paths are not supported".into());
        }
    }
    Ok(p)
}
fn directory(root: &Path, name: &str) -> Result<PathBuf, String> {
    let p = safe_child(root, name)?;
    fs::create_dir_all(&p).map_err(|e| e.to_string())?;
    Ok(p)
}
fn project_root<R: tauri::Runtime>(app: &tauri::AppHandle<R>, id: &str) -> Result<(PathBuf, Value), String> {
    segment(id)?;
    let workspace = crate::workspace::workspace_read(app.clone())?;
    let data = workspace["data"].as_str().ok_or("Save a project first")?;
    let library: Value = serde_json::from_str(data).map_err(|e| e.to_string())?;
    let project = library["entries"]
        .as_array()
        .ok_or("Invalid library")?
        .iter()
        .find(|e| e["project"]["id"] == id)
        .ok_or("Unknown project")?["project"]
        .clone();
    let base = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let root = directory(&directory(&base, "project-vault-v1")?, id)?;
    Ok((root, project))
}
fn unique_dir(root: &Path) -> Result<PathBuf, String> {
    let dir = tempfile::Builder::new()
        .prefix("snapshot-")
        .tempdir_in(root)
        .map_err(|e| e.to_string())?;
    Ok(dir.keep())
}
fn atomic(root: &Path, name: &str, data: &[u8]) -> Result<(), String> {
    let path = safe_child(root, name)?;
    let mut f = tempfile::NamedTempFile::new_in(root).map_err(|e| e.to_string())?;
    f.write_all(data).map_err(|e| e.to_string())?;
    f.as_file().sync_all().map_err(|e| e.to_string())?;
    f.persist(path).map_err(|e| e.to_string())?;
    Ok(())
}
fn collect(
    value: &Value,
    path: &str,
    dir: &Path,
    files: &mut Vec<Value>,
    external: &mut Vec<Value>,
) -> Result<(), String> {
    match value{
 Value::String(s) if s.starts_with("data:image/")=>{let (head,payload)=s.split_once(',').ok_or("Malformed image")?;let ext=match head{"data:image/png;base64"=>"png","data:image/jpeg;base64"=>"jpg","data:image/webp;base64"=>"webp","data:image/gif;base64"=>"gif",_=>{external.push(json!({"source":path,"reason":"unsupported image encoding"}));return Ok(())}};let bytes=STANDARD.decode(payload).map_err(|e|e.to_string())?;if bytes.len()>20_000_000{return Err("Image exceeds 20MB".into());}let name=format!("image-{:03}.{ext}",files.len()+1);atomic(dir,&name,&bytes)?;files.push(json!({"name":name,"source":path,"bytes":bytes.len(),"kind":"image"}));},
 Value::String(s) if (path.ends_with(".image")||path.ends_with(".reference")||path.contains(".itemImages["))&&!s.is_empty()=>external.push(json!({"source":path,"reference":s,"reason":"bundled or external reference; not copied"})),
 Value::Object(o)=>for (key,v) in o{collect(v,&format!("{path}.{key}"),dir,files,external)?},
 Value::Array(a)=>for(i,v)in a.iter().enumerate(){collect(v,&format!("{path}[{i}]"),dir,files,external)?},_=>{}}
    Ok(())
}
fn snapshot(root: &Path, project: &Value, design: &str) -> Result<Value, String> {
    if design.len() > 1_000_000 {
        return Err("Design document too large".into());
    }
    let snapshots = directory(root, "snapshots")?;
    let dir = unique_dir(&snapshots)?;
    let mut images = vec![];
    let mut external = vec![];
    collect(
        project,
        "project",
        &directory(&dir, "images")?,
        &mut images,
        &mut external,
    )?;
    atomic(
        &dir,
        "project.aphrodite.json",
        &serde_json::to_vec_pretty(project).map_err(|e| e.to_string())?,
    )?;
    atomic(&dir, "DESIGN.md", design.as_bytes())?;
    if let Some(source) = project["system"]["originalMarkdown"].as_str() {
        atomic(&dir, "SOURCE-DESIGN.md", source.as_bytes())?;
    }
    let manifest = json!({"version":1,"snapshot":dir.file_name().unwrap().to_string_lossy(),"images":images,"externalReferences":external});
    atomic(
        &dir,
        "manifest.json",
        &serde_json::to_vec_pretty(&manifest).unwrap(),
    )?;
    // Publish last. Incomplete snapshots never replace the current pointer.
    atomic(
        root,
        "current.json",
        &serde_json::to_vec(&manifest).unwrap(),
    )?;
    prune_snapshots(root);
    Ok(manifest)
}
fn prune_snapshots(root: &Path) {
    let keep_name = match current(root) {
        Ok(manifest) => match manifest["snapshot"].as_str() {
            Some(name) if !name.is_empty() => name.to_string(),
            _ => return,
        },
        Err(e) => {
            eprintln!("vault: snapshot prune skipped: {e}");
            return;
        }
    };
    let snapshots = match safe_child(root, "snapshots") {
        Ok(path) => path,
        Err(e) => {
            eprintln!("vault: snapshot prune skipped: {e}");
            return;
        }
    };
    let entries = match fs::read_dir(&snapshots) {
        Ok(entries) => entries,
        Err(e) => {
            eprintln!("vault: snapshot prune skipped: {e}");
            return;
        }
    };
    let mut dirs: Vec<(SystemTime, String)> = Vec::new();
    for entry in entries {
        let entry = match entry {
            Ok(entry) => entry,
            Err(e) => {
                eprintln!("vault: snapshot prune skipped entry: {e}");
                continue;
            }
        };
        let Some(name) = entry.file_name().to_str().map(str::to_string) else {
            continue;
        };
        if segment(&name).is_err() {
            continue;
        }
        let path = match safe_child(&snapshots, &name) {
            Ok(path) => path,
            Err(_) => continue,
        };
        let meta = match fs::symlink_metadata(&path) {
            Ok(meta) => meta,
            Err(_) => continue,
        };
        if meta.file_type().is_symlink() || !meta.is_dir() {
            continue;
        }
        let mtime = meta.modified().unwrap_or(SystemTime::UNIX_EPOCH);
        dirs.push((mtime, name));
    }
    dirs.sort_by(|a, b| a.0.cmp(&b.0).then_with(|| a.1.cmp(&b.1)));
    let excess = dirs.len().saturating_sub(KEEP_SNAPSHOTS);
    if excess == 0 {
        return;
    }
    let mut removed = 0;
    for (_, name) in &dirs {
        if removed >= excess {
            break;
        }
        if name == &keep_name {
            continue;
        }
        match safe_child(&snapshots, name) {
            Ok(path) => {
                if let Err(e) = fs::remove_dir_all(&path) {
                    eprintln!("vault: failed to prune snapshot {name}: {e}");
                    continue;
                }
                removed += 1;
            }
            Err(e) => eprintln!("vault: failed to prune snapshot {name}: {e}"),
        }
    }
}
fn current(root: &Path) -> Result<Value, String> {
    let raw = fs::read(safe_child(root, "current.json")?).map_err(|e| e.to_string())?;
    serde_json::from_slice(&raw).map_err(|e| e.to_string())
}
fn listing(root: &Path) -> Result<Value, String> {
    let mut files = vec![];
    let manifest = current(root)?;
    let id = manifest["snapshot"].as_str().ok_or("Invalid snapshot")?;
    let dir = safe_child(&safe_child(root, "snapshots")?, id)?;
    for name in [
        "DESIGN.md",
        "SOURCE-DESIGN.md",
        "project.aphrodite.json",
        "manifest.json",
    ] {
        let p = safe_child(&dir, name)?;
        if p.exists() {
            files.push(json!({"name":name,"kind":"snapshot","bytes":fs::metadata(p).map_err(|e|e.to_string())?.len()}));
        }
    }
    for image in manifest["images"].as_array().ok_or("Invalid images")? {
        files.push(image.clone());
    }
    let docs = directory(root, "documents")?;
    for entry in fs::read_dir(docs).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        if !entry.file_name().as_encoded_bytes().starts_with(b".") && entry.file_type().map_err(|e| e.to_string())?.is_file() {
            files.push(json!({"name":entry.file_name().to_string_lossy(),"kind":"document","bytes":entry.metadata().map_err(|e|e.to_string())?.len()}));
        }
    }
    Ok(
        json!({"path":root,"snapshot":id,"files":files,"externalReferences":manifest["externalReferences"]}),
    )
}
fn write_document(root: &Path, name: &str, text: &str) -> Result<(), String> {
    segment(name)?;
    if !["md", "txt", "json"]
        .iter()
        .any(|ext| name.ends_with(&format!(".{ext}")))
    {
        return Err("Use .md, .txt or .json".into());
    }
    if text.len() > 1_000_000 {
        return Err("Document exceeds 1MB".into());
    }
    let dir = directory(root, "documents")?;
    let path = safe_child(&dir, name)?;
    let mut tmp = tempfile::NamedTempFile::new_in(&dir).map_err(|e| e.to_string())?;
    tmp.write_all(text.as_bytes()).map_err(|e| e.to_string())?;
    #[cfg(test)]
    dispatch::before_sync(&path);
    tmp.as_file().sync_all().map_err(|e| e.to_string())?;
    tmp.persist_noclobber(path)
        .map_err(|_| "That filename already exists. Choose a new name.".to_string())?;
    Ok(())
}
#[tauri::command]
pub async fn vault_sync(
    app: tauri::AppHandle,
    project_id: String,
    expected: Value,
    design: String,
) -> Result<Value, String> {
    crate::disk::write(move || {
        let _guard = SNAPSHOTS.lock().unwrap_or_else(|e| e.into_inner());
        let (root, project) = project_root(&app, &project_id)?;
        if project != expected {
            return Err("Project changed. Reopen the vault after saving.".into());
        }
        snapshot(&root, &project, &design)?;
        listing(&root)
    }).await
}
#[tauri::command]
pub async fn vault_document<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    project_id: String,
    name: String,
    text: String,
) -> Result<Value, String> {
    crate::disk::write(move || {
        let (root, _) = project_root(&app, &project_id)?;
        write_document(&root, &name, &text)?;
        listing(&root)
    }).await
}
#[tauri::command]
pub fn vault_read(
    app: tauri::AppHandle,
    project_id: String,
    name: String,
    kind: String,
    snapshot_id: String,
) -> Result<Value, String> {
    let (root, _) = project_root(&app, &project_id)?;
    let dir = match kind.as_str() {
        "document" => safe_child(&root, "documents")?,
        "snapshot" => safe_child(&safe_child(&root, "snapshots")?, &snapshot_id)?,
        "image" => safe_child(
            &safe_child(&safe_child(&root, "snapshots")?, &snapshot_id)?,
            "images",
        )?,
        _ => return Err("Invalid kind".into()),
    };
    let path = safe_child(&dir, &name)?;
    let file = fs::File::open(&path).map_err(|e| e.to_string())?;
    if !file.metadata().map_err(|e| e.to_string())?.is_file() {
        return Err("Not a regular file".into());
    }
    let mut bytes = Vec::new();
    file.take(20_000_001)
        .read_to_end(&mut bytes)
        .map_err(|e| e.to_string())?;
    if bytes.len() > 20_000_000 {
        return Err("File too large".into());
    }
    if kind == "image" {
        let mime = if name.ends_with(".png") {
            "image/png"
        } else if name.ends_with(".jpg") {
            "image/jpeg"
        } else if name.ends_with(".webp") {
            "image/webp"
        } else if name.ends_with(".gif") {
            "image/gif"
        } else {
            return Err("Unsupported image".into());
        };
        Ok(json!({"image":format!("data:{mime};base64,{}",STANDARD.encode(bytes))}))
    } else {
        Ok(json!({"text":String::from_utf8(bytes).map_err(|e|e.to_string())?}))
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn snapshot_extracts_and_retains_original() {
        let d = tempfile::tempdir().unwrap();
        let p = json!({"reference":"data:image/png;base64,aGVsbG8=","system":{"originalMarkdown":"# source"}});
        let m = snapshot(d.path(), &p, "# design").unwrap();
        assert_eq!(m["images"][0]["bytes"], 5);
        assert!(listing(d.path()).unwrap()["files"]
            .as_array()
            .unwrap()
            .iter()
            .any(|f| f["name"] == "SOURCE-DESIGN.md"));
        let prior = current(d.path()).unwrap();
        assert!(snapshot(
            d.path(),
            &json!({"reference":"data:image/png;base64,???"}),
            "# bad"
        )
        .is_err());
        assert_eq!(current(d.path()).unwrap(), prior);
    }
    #[test]
    fn opus_9_a_siblings_temporary_document_is_hidden() {
        let dir=tempfile::tempdir().unwrap();
        snapshot(dir.path(),&json!({}),"").unwrap();
        write_document(dir.path(),"real.md","kept").unwrap();
        let pending=tempfile::NamedTempFile::new_in(dir.path().join("documents")).unwrap();
        let files=listing(dir.path()).unwrap()["files"].as_array().unwrap().clone();
        assert!(files.iter().any(|v| v["name"]=="real.md"));
        assert!(!files.iter().any(|v| v["name"]==pending.path().file_name().unwrap().to_str().unwrap()));
    }
    #[test]
    fn documents_do_not_overwrite() {
        let d = tempfile::tempdir().unwrap();
        write_document(d.path(), "brief.md", "one").unwrap();
        assert!(write_document(d.path(), "brief.md", "two").is_err());
        assert_eq!(
            fs::read_to_string(d.path().join("documents/brief.md")).unwrap(),
            "one"
        );
        for name in [
            "../secret.md",
            "/tmp/x.md",
            ".hidden.md",
            "a/b.md",
            "run.html",
        ] {
            assert!(write_document(d.path(), name, "bad").is_err());
        }
    }
    #[test]
    #[cfg(unix)]
    fn symlink_rejected() {
        let d = tempfile::tempdir().unwrap();
        std::os::unix::fs::symlink("/tmp", d.path().join("documents")).unwrap();
        assert!(write_document(d.path(), "a.md", "bad").is_err());
    }
    fn snapshot_dir_names(root: &Path) -> Vec<String> {
        let mut names: Vec<String> = fs::read_dir(root.join("snapshots"))
            .unwrap()
            .map(|e| e.unwrap())
            .filter(|e| e.path().is_dir())
            .map(|e| e.file_name().to_string_lossy().into_owned())
            .collect();
        names.sort();
        names
    }
    #[test]
    fn pruning_caps_snapshots_at_five() {
        let d = tempfile::tempdir().unwrap();
        let p = json!({"system": {}});
        for _ in 0..7 {
            snapshot(d.path(), &p, "# design").unwrap();
        }
        let names = snapshot_dir_names(d.path());
        assert!(names.len() <= KEEP_SNAPSHOTS);
        let id = current(d.path()).unwrap()["snapshot"]
            .as_str()
            .unwrap()
            .to_string();
        assert!(d.path().join("snapshots").join(&id).is_dir());
        assert!(names.contains(&id));
    }
    #[test]
    fn pruning_removes_orphan_directory() {
        let d = tempfile::tempdir().unwrap();
        let snapshots = directory(d.path(), "snapshots").unwrap();
        let orphan = snapshots.join("snapshot-orphan");
        fs::create_dir(&orphan).unwrap();
        for i in 0..5 {
            fs::create_dir(snapshots.join(format!("snapshot-old-{i}"))).unwrap();
        }
        snapshot(d.path(), &json!({"system": {}}), "# design").unwrap();
        assert!(!orphan.exists());
        assert!(snapshot_dir_names(d.path()).len() <= KEEP_SNAPSHOTS);
    }
    #[test]
    fn pruning_keeps_referenced_current_directory() {
        let d = tempfile::tempdir().unwrap();
        let m = snapshot(d.path(), &json!({"system": {}}), "# design").unwrap();
        let keep = m["snapshot"].as_str().unwrap().to_string();
        let snapshots = d.path().join("snapshots");
        for i in 0..6 {
            fs::create_dir(snapshots.join(format!("snapshot-newer-{i}"))).unwrap();
        }
        prune_snapshots(d.path());
        assert!(snapshots.join(&keep).is_dir());
        assert_eq!(
            current(d.path()).unwrap()["snapshot"].as_str().unwrap(),
            keep
        );
        assert!(snapshot_dir_names(d.path()).len() <= KEEP_SNAPSHOTS);
        assert!(snapshot_dir_names(d.path()).contains(&keep));
    }
}

#[cfg(test)]
mod dispatch {
    use super::*;
    use std::{
        sync::{mpsc, Mutex},
        time::Duration,
    };
    use tauri::{
        ipc::{CallbackFn, InvokeBody},
        test::{get_ipc_response, mock_builder, mock_context, noop_assets},
        webview::InvokeRequest,
    };

    struct Stall {
        path: PathBuf,
        started: mpsc::Sender<()>,
        finish: mpsc::Receiver<()>,
    }
    static STALL: Mutex<Option<Stall>> = Mutex::new(None);
    pub(super) fn before_sync(path: &Path) {
        let mut current = STALL.lock().unwrap();
        if current.as_ref().is_some_and(|s| s.path == path) {
            let stall = current.take().unwrap();
            drop(current);
            stall.started.send(()).unwrap();
            stall.finish.recv_timeout(Duration::from_secs(10)).unwrap();
        }
    }
    #[test]
    fn astra_12_opus_9_a_dispatched_document_stalled_at_sync_holds_the_close_command() {
        let _serial = crate::disk::TEST_SERIAL.lock().unwrap();
        let dir = tempfile::tempdir().unwrap();
        let mut context = mock_context(noop_assets());
        context.config_mut().identifier = dir.path().to_str().unwrap().into();
        let app = mock_builder()
            .invoke_handler(tauri::generate_handler![
                vault_document,
                crate::disk::disk_begin_close,
                crate::disk::disk_end_close
            ])
            .build(context)
            .unwrap();
        assert_eq!(app.path().app_data_dir().unwrap(), dir.path());
        let web = tauri::WebviewWindowBuilder::new(&app, "main", Default::default())
            .build()
            .unwrap();
        let ws = dir.path().join("workspace-v1");
        fs::create_dir(&ws).unwrap();
        let project = json!({"id":"fixture"});
        let library = json!({"entries":[{"project":project}]});
        fs::write(
            ws.join("library.json"),
            json!({"revision":1,"data":library.to_string()}).to_string(),
        )
        .unwrap();
        let (root, _) = project_root(app.handle(), "fixture").unwrap();
        snapshot(&root, &project, "design").unwrap();
        let target = root.join("documents/doc.md");
        let (started, writing) = mpsc::channel();
        let (release, finish) = mpsc::channel();
        *STALL.lock().unwrap() = Some(Stall {
            path: target.clone(),
            started,
            finish,
        });
        let invoke = |cmd: &str, args: Value| {
            get_ipc_response(
                &web,
                InvokeRequest {
                    cmd: cmd.into(),
                    body: InvokeBody::Json(args),
                    callback: CallbackFn(0),
                    error: CallbackFn(1),
                    url: "tauri://localhost".parse().unwrap(),
                    headers: Default::default(),
                    invoke_key: tauri::test::INVOKE_KEY.into(),
                },
            )
            .unwrap()
            .deserialize::<Value>()
            .unwrap()
        };
        std::thread::scope(|workers| {
            let doc = workers.spawn(|| {
                invoke(
                    "vault_document",
                    json!({"projectId":"fixture","name":"doc.md","text":"kept"}),
                )
            });
            writing.recv_timeout(Duration::from_secs(10)).unwrap();
            assert_eq!(
                invoke("disk_begin_close", json!({"ticket":"test","timeoutMs":10})),
                false
            );
            assert!(!target.exists());
            release.send(()).unwrap();
            doc.join().unwrap();
            assert_eq!(
                invoke(
                    "disk_begin_close",
                    json!({"ticket":"test","timeoutMs":1000})
                ),
                true
            );
            assert_eq!(fs::read(target).unwrap(), b"kept");
            invoke("disk_end_close", json!({"ticket":"test"}));
        });
    }
}
