//! The parsers locate one entry. Only the byte ranges in the preview reach the writer.
use super::{Code, Result, Tool};
use jsonc_parser::{
    ast::Object, common::Ranged, parse_to_ast, tokens::Token, CollectOptions, ParseOptions,
};
use serde::Serialize;
use std::ops::Range;
use toml_edit::{ImDocument, Item};

#[derive(Clone, Debug, Serialize)]
pub struct Change {
    pub start: usize,
    pub before: String,
    pub after: String,
}
impl Change {
    pub(super) fn at(source: &str, range: Range<usize>, after: String) -> Self {
        Self {
            start: range.start,
            before: source[range].to_owned(),
            after,
        }
    }
    fn insert(at: usize, after: String) -> Self {
        Self {
            start: at,
            before: String::new(),
            after,
        }
    }
}

pub fn edited(source: &str, changes: &[Change]) -> Result<String> {
    let mut out = String::new();
    let mut end = 0;
    for c in changes {
        out.push_str(source.get(end..c.start).ok_or(Code::Changed)?);
        end = c.start.checked_add(c.before.len()).ok_or(Code::Changed)?;
        if source.get(c.start..end) != Some(&c.before) {
            return Err(Code::Changed);
        }
        out.push_str(&c.after);
    }
    out.push_str(&source[end..]);
    Ok(out)
}

pub struct Layout {
    pub command: Option<String>,
    // Hash these entry bytes for ownership, independently of edits elsewhere in the document.
    pub entry: Vec<Range<usize>>,
    pub connect: Vec<Change>,
    pub remove: Vec<Change>,
}
fn missing(c: Change) -> Layout {
    Layout {
        command: None,
        entry: vec![],
        connect: vec![c],
        remove: vec![],
    }
}

pub fn json_entry(tool: Tool, exe: &str) -> String {
    let command = serde_json::to_string(exe).unwrap();
    if tool == Tool::ClaudeDesktop {
        format!(r#"{{"command":{command}}}"#)
    } else {
        format!(r#"{{"type":"stdio","command":{command}}}"#)
    }
}

fn object_property<'a, 'b>(
    object: &'b Object<'a>,
    key: &str,
) -> Result<Option<&'b jsonc_parser::ast::ObjectProp<'a>>> {
    let mut matches = object.properties.iter().filter(|p| p.name.as_str() == key);
    let first = matches.next();
    if matches.next().is_some() {
        return Err(Code::Ambiguous);
    }
    Ok(first)
}

fn json(tool: Tool, original: Option<&str>, exe: &str) -> Result<Layout> {
    let value = json_entry(tool, exe);
    let property = format!(r#""aphrodite":{value}"#);
    let container = format!(r#""mcpServers":{{{property}}}"#);
    let Some(source) = original else {
        return Ok(missing(Change::insert(0, format!("{{{container}}}"))));
    };
    let comments = tool == Tool::Cursor;
    let opts = ParseOptions {
        allow_comments: comments,
        allow_trailing_commas: comments,
        allow_loose_object_property_names: false,
        allow_missing_commas: false,
        allow_single_quoted_strings: false,
        allow_hexadecimal_numbers: false,
        allow_unary_plus_numbers: false,
        allow_bare_decimal_point_numbers: false,
        allow_non_finite_numbers: false,
        allow_extended_string_escapes: false,
    };
    let parsed = parse_to_ast(
        source,
        &CollectOptions {
            tokens: true,
            comments: jsonc_parser::CommentCollectionStrategy::AsTokens,
        },
        &opts,
    )
    .map_err(|_| Code::InvalidConfig)?;
    // Validate original bytes, masking only Cursor's two documented-by-the-parser extensions.
    let mut strict = source.as_bytes().to_vec();
    let mut tokens = parsed.tokens.unwrap();
    tokens.retain(|t| {
        if comments && matches!(t.token, Token::CommentLine(_) | Token::CommentBlock(_)) {
            strict[t.start()..t.end()].fill(b' ');
            false
        } else {
            true
        }
    });
    if comments {
        for pair in tokens.windows(2) {
            if matches!(pair[0].token, Token::Comma)
                && matches!(pair[1].token, Token::CloseBrace | Token::CloseBracket)
            {
                strict[pair[0].start()] = b' ';
            }
        }
    }
    serde_json::from_slice::<serde_json::Value>(&strict).map_err(|_| Code::InvalidConfig)?;
    let root = parsed
        .value
        .as_ref()
        .and_then(|v| v.as_object())
        .ok_or(Code::InvalidConfig)?;
    let (parent, addition) = if let Some(servers) = object_property(root, "mcpServers")? {
        let obj = servers.value.as_object().ok_or(Code::InvalidConfig)?;
        if let Some(prop) = object_property(obj, "aphrodite")? {
            let range = prop.start()..prop.end();
            let command = prop
                .value
                .as_object()
                .and_then(|v| v.get_string("command"))
                .map(|v| v.value.to_string());
            let mut remove = vec![Change::at(source, prop.start()..prop.end(), String::new())];

            let after = tokens.iter().find(|t| t.start() >= prop.end());
            let before = tokens.iter().rev().find(|t| t.end() <= prop.start());
            if let Some(comma) = after
                .filter(|t| matches!(t.token, Token::Comma))
                .or_else(|| before.filter(|t| matches!(t.token, Token::Comma)))
            {
                remove.push(Change::at(
                    source,
                    comma.start()..comma.end(),
                    String::new(),
                ));
                remove.sort_by_key(|c| c.start);
            }
            return Ok(Layout {
                command,
                entry: vec![range.clone()],
                connect: vec![Change::at(source, range, property)],
                remove,
            });
        }
        (obj, property)
    } else {
        (root, container)
    };
    let comma = if parent.properties.is_empty() {
        ""
    } else {
        ","
    };
    Ok(missing(Change::insert(
        parent.start() + 1,
        addition + comma,
    )))
}

fn toml_value(exe: &str) -> String {
    toml_edit::Value::from(exe).to_string()
}
pub fn toml_entry(exe: &str, nl: &str) -> String {
    format!("[mcp_servers.aphrodite]{nl}command = {}", toml_value(exe))
}

// Explicit TOML tables have a physical span for their header and direct assignments.
// Subtables can appear *after* an unrelated table. Dotted keys have no physical header.
fn blocks(source: &str, item: &Item, spans: &mut Vec<Range<usize>>) -> Result<()> {
    if let Some(array) = item.as_array_of_tables() {
        for t in array.iter() {
            table_blocks(source, t, spans)?;
        }
    } else if let Some(t) = item.as_table() {
        table_blocks(source, t, spans)?;
    }
    Ok(())
}
fn table_blocks(
    source: &str,
    table: &toml_edit::Table,
    spans: &mut Vec<Range<usize>>,
) -> Result<()> {
    let header = table.span();
    if let Some(r) = &header {
        spans.push(r.clone());
    }
    for (name, item) in table.iter() {
        if item.is_value() && header.is_none() {
            let key = table
                .key(name)
                .and_then(|k| k.span())
                .ok_or(Code::InvalidConfig)?;
            let start = source[..key.start].rfind('\n').map_or(0, |i| i + 1);
            spans.push(start..item.span().ok_or(Code::InvalidConfig)?.end);
        } else {
            blocks(source, item, spans)?;
        }
    }
    Ok(())
}

fn toml(source: &str, exe: &str) -> Result<Layout> {
    let doc = ImDocument::parse(source).map_err(|_| Code::InvalidConfig)?;
    let nl = if source.contains("\r\n") {
        "\r\n"
    } else {
        "\n"
    };
    let table = toml_entry(exe, nl);
    let prefix = if source.is_empty() || source.ends_with('\n') {
        ""
    } else {
        nl
    };
    let suffix = if source.is_empty() || source.ends_with('\n') {
        nl
    } else {
        ""
    };
    let append = Change::insert(source.len(), format!("{prefix}{table}{suffix}"));
    let Some(parent) = doc.get("mcp_servers") else {
        return Ok(missing(append));
    };
    let servers = parent.as_table_like().ok_or(Code::InvalidConfig)?;
    let inline = format!("{{ command = {} }}", toml_value(exe));
    let Some(item) = servers.get("aphrodite") else {
        if let Some(parent) = parent.as_inline_table() {
            let pos = parent.span().ok_or(Code::InvalidConfig)?.start + 1;
            let comma = if parent.is_empty() { "" } else { ", " };
            return Ok(missing(Change::insert(
                pos,
                format!("aphrodite = {inline}{comma}"),
            )));
        }
        return Ok(missing(append));
    };
    let command = item
        .get("command")
        .and_then(Item::as_str)
        .map(str::to_owned);
    if item.as_inline_table().is_some_and(|t| t.is_dotted()) {
        return Err(Code::UnsupportedLayout);
    }
    if item.is_value() {
        let span = item.span().ok_or(Code::InvalidConfig)?;
        let key = servers
            .key("aphrodite")
            .and_then(|k| k.span())
            .ok_or(Code::InvalidConfig)?;
        let mut property = key.start..span.end;
        if parent.is_inline_table() {
            let after = &source[property.end..];
            let before = &source[..property.start];
            if after.trim_start().starts_with(',') {
                property.end += after.find(',').unwrap() + 1;
            } else if before.trim_end().ends_with(',') {
                property.start = before.rfind(',').unwrap();
            }
        } else {
            property.start = source[..property.start].rfind('\n').map_or(0, |i| i + 1);
        }
        return Ok(Layout {
            command,
            entry: vec![key.start..span.end],
            connect: vec![Change::at(source, span, inline)],
            remove: vec![Change::at(source, property, String::new())],
        });
    }
    let mut entry = vec![];
    blocks(source, item, &mut entry)?;
    entry.sort_by_key(|r| r.start);
    // A direct dotted assignment can also be contained in its explicit parent's span.
    let mut disjoint: Vec<Range<usize>> = vec![];
    for r in entry {
        if !disjoint.last().is_some_and(|p| p.end >= r.end) {
            disjoint.push(r);
        }
    }
    if disjoint.is_empty() {
        return Err(Code::InvalidConfig);
    }
    let remove: Vec<_> = disjoint
        .iter()
        .map(|r| Change::at(source, r.clone(), String::new()))
        .collect();
    let mut connect = remove.clone();
    if source[disjoint[0].clone()].starts_with('[') {
        connect[0].after = table;
    } else {
        connect.push(append);
    }
    Ok(Layout {
        command,
        entry: disjoint,
        connect,
        remove,
    })
}

pub fn layout(tool: Tool, source: Option<&str>, exe: &str) -> Result<Layout> {
    let prefix = source.is_some_and(|s| s.starts_with('\u{feff}'));
    if prefix && tool == Tool::ClaudeDesktop {
        return Err(Code::UnsupportedLayout);
    }
    let body = source.map(|s| s.strip_prefix('\u{feff}').unwrap_or(s));
    let mut layout = if tool == Tool::Codex {
        toml(body.unwrap_or(""), exe)?
    } else {
        json(tool, body, exe)?
    };
    if prefix {
        for range in &mut layout.entry {
            range.start += 3;
            range.end += 3;
        }
        for change in layout.connect.iter_mut().chain(&mut layout.remove) {
            change.start += 3;
        }
    }
    Ok(layout)
}
