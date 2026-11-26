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
pub fn parse(text: &str) -> Result<Value, ()> {
    let mut depth = 0usize;
    let mut structure = 0usize;
    let max_structure = limit("structure");
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
                    return Err(());
                }
            }
            b'}' | b']' if !quoted => depth = depth.saturating_sub(1),
            b',' | b':' if !quoted => structure += 1,
            _ => (),
        }
        if structure > max_structure {
            return Err(());
        }
    }
    serde_json::from_str(text).map_err(|_| ())
}
