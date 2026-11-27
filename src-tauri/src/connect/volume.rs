// Disk Arbitration exposes the mounted device's description without launching a helper.
use core_foundation::{
    base::{CFAllocatorRef, CFType, CFTypeRef, TCFType},
    dictionary::{CFDictionary, CFDictionaryRef},
    string::{CFString, CFStringRef},
};
use std::{
    ffi::{CString, OsStr},
    os::unix::ffi::OsStrExt,
    ptr,
};

#[link(name = "DiskArbitration", kind = "framework")]
unsafe extern "C" {
    fn DASessionCreate(allocator: CFAllocatorRef) -> CFTypeRef;
    fn DADiskCreateFromBSDName(
        allocator: CFAllocatorRef,
        session: CFTypeRef,
        name: *const libc::c_char,
    ) -> CFTypeRef;
    fn DADiskCopyDescription(disk: CFTypeRef) -> CFDictionaryRef;
    static kDADiskDescriptionDeviceModelKey: CFStringRef;
    static kDADiskDescriptionDeviceProtocolKey: CFStringRef;
}

pub(super) fn is_image(device: &OsStr) -> Option<bool> {
    let name = CString::new(device.as_bytes().strip_prefix(b"/dev/")?).ok()?;
    // Each Create/Copy returns an owned nullable CF reference. Keep the session,
    // disk and dictionary alive until their description values have been copied.
    unsafe {
        let session = DASessionCreate(ptr::null());
        if session.is_null() {
            return None;
        }
        let session = CFType::wrap_under_create_rule(session);
        let disk = DADiskCreateFromBSDName(ptr::null(), session.as_CFTypeRef(), name.as_ptr());
        if disk.is_null() {
            return None;
        }
        let disk = CFType::wrap_under_create_rule(disk);
        let dict = DADiskCopyDescription(disk.as_CFTypeRef());
        if dict.is_null() {
            return None;
        }
        let dict = CFDictionary::<CFString, CFType>::wrap_under_create_rule(dict);
        let string = |key| {
            dict.find(&CFString::wrap_under_get_rule(key))?
                .downcast::<CFString>()
                .map(|v| v.to_string())
        };
        classify(
            string(kDADiskDescriptionDeviceModelKey).as_deref(),
            string(kDADiskDescriptionDeviceProtocolKey).as_deref(),
        )
    }
}

pub(super) fn classify(model: Option<&str>, protocol: Option<&str>) -> Option<bool> {
    if model.is_some_and(|m| m.trim().eq_ignore_ascii_case("Disk Image"))
        || protocol == Some("Disk Image")
    {
        return Some(true);
    }
    match protocol?.trim() {
        "USB"
        | "FireWire"
        | "Secure Digital"
        | "ATA"
        | "ATAPI"
        | "SATA"
        | "SAS"
        | "PCI"
        | "PCI-Express"
        | "Thunderbolt"
        | "Apple Fabric"
        | "SCSI Parallel Interface"
        | "Fibre Channel Interface" => Some(false),
        _ => None,
    }
}
