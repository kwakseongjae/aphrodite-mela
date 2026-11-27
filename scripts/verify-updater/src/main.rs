use base64::{engine::general_purpose::STANDARD, Engine};
use minisign_verify::{PublicKey, Signature};
use std::{env, error::Error, io::{self, Read}};

fn main() -> Result<(), Box<dyn Error>> {
    let mut args = env::args().skip(1);
    let key = STANDARD.decode(args.next().ok_or("expected the Tauri public key")?)?;
    let signature = STANDARD.decode(args.next().ok_or("expected the Tauri signature")?)?;
    let key = PublicKey::decode(std::str::from_utf8(&key)?)?;
    let signature = Signature::decode(std::str::from_utf8(&signature)?)?;
    let mut archive = Vec::new();
    io::stdin().read_to_end(&mut archive)?;
    key.verify(&archive, &signature, true)?;
    Ok(())
}
