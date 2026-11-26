use serde_json::Value;
use std::io::{self, BufRead, Read};

pub fn limit(name: &str) -> usize {
    super::manifest()["limits"][name].as_u64().unwrap() as usize
}

pub fn bytes(reader: impl Read, limit: usize) -> io::Result<Vec<u8>> {
    let mut bytes = Vec::new();
    reader.take(limit as u64 + 1).read_to_end(&mut bytes)?;
    if bytes.len() > limit {
        return Err(io::ErrorKind::InvalidData.into());
    }
    Ok(bytes)
}

// Consume CR and LF as byte delimiters, including when CRLF straddles two reads.
pub fn frame(reader: &mut impl BufRead, limit: usize) -> io::Result<Option<Result<Vec<u8>, ()>>> {
    let mut line = Vec::new();
    let mut oversized = false;
    loop {
        let buf = reader.fill_buf()?;
        let eof = buf.is_empty();
        let end = buf.iter().position(|&b| b == 10 || b == 13);
        let n = end.unwrap_or(buf.len());
        if line.len() + n > limit {
            oversized = true;
            line.clear();
        }
        if !oversized {
            line.extend_from_slice(&buf[..n]);
        }
        reader.consume(n + usize::from(end.is_some()));
        if oversized && (eof || end.is_some()) {
            return Ok(Some(Err(())));
        }
        if !line.is_empty() && (eof || end.is_some()) {
            return Ok(Some(Ok(line)));
        }
        if eof {
            return Ok(None);
        }
    }
}

pub fn decode(bytes: &[u8]) -> Result<&str, ()> {
    let text = std::str::from_utf8(bytes).map_err(|_| ())?;
    Ok(text.strip_prefix('\u{feff}').unwrap_or(text))
}
pub fn fits_tree(text: &str, max_structure: usize) -> bool {
    let mut depth = 0usize;
    let mut structure = 0usize;
    let mut quoted = false;
    let mut bytes = text.bytes();
    let limit = limit("depth");
    while let Some(b) = bytes.next() {
        match b {
            b'\\' if quoted => {
                bytes.next();
            }
            b'"' => quoted = !quoted,
            b'{' | b'[' if !quoted => {
                depth += 1;
                structure += 1;
                if depth > limit {
                    return false;
                }
            }
            b'}' | b']' if !quoted => depth = depth.saturating_sub(1),
            b',' | b':' if !quoted => structure += 1,
            _ => (),
        }
        if structure > max_structure {
            return false;
        }
    }
    true
}

pub fn parse(text: &str) -> Result<Value, ()> {
    if !fits_tree(text, limit("structure")) {
        return Err(());
    }
    serde_json::from_str(text).map_err(|_| ())
}

// RawValue checks container grammar without recursion. Decode scalar tokens separately
// with the normal parser so number range and Unicode escapes get the same validation.
pub fn validate_raw(text: &str) -> Result<(), ()> {
    serde_json::from_str::<&serde_json::value::RawValue>(text).map_err(|_| ())?;
    let mut rest = text;
    while !rest.is_empty() {
        rest = rest.trim_start_matches([' ', '\n', '\r', '\t', '[', ']', '{', '}', ':', ',']);
        if rest.is_empty() {
            break;
        }
        let mut values = serde_json::Deserializer::from_str(rest).into_iter::<Value>();
        values.next().ok_or(())?.map_err(|_| ())?;
        rest = &rest[values.byte_offset()..];
    }
    Ok(())
}

// The caller has validated the whole body. Borrow each member value so unrelated
// fields (including deeply nested ones) never need a recursive tree. Last key wins.
pub fn raw_member<'a>(text: &'a str, key: &str) -> Option<&'a str> {
    let mut rest = text.trim_start().strip_prefix('{')?.trim_start();
    let mut found = None;
    while !rest.starts_with('}') {
        let mut keys = serde_json::Deserializer::from_str(rest).into_iter::<String>();
        let name = keys.next()?.ok()?;
        rest = rest[keys.byte_offset()..].trim_start().strip_prefix(':')?;
        let mut values =
            serde_json::Deserializer::from_str(rest).into_iter::<&serde_json::value::RawValue>();
        let value = values.next()?.ok()?;
        if name == key {
            found = Some(value.get());
        }
        rest = rest[values.byte_offset()..].trim_start();
        if let Some(next) = rest.strip_prefix(',') {
            rest = next.trim_start();
        }
    }
    found
}
