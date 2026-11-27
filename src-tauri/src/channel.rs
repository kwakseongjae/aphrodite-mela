#[derive(Clone, Copy, PartialEq, Eq)]
pub enum Channel {
    Stable,
    Preview,
}

impl Channel {
    pub fn from_identifier(identifier: &str) -> Self {
        if identifier.ends_with(".preview") { Self::Preview } else { Self::Stable }
    }

    pub fn board_scheme(self) -> &'static str {
        match self {
            Self::Stable => "aphrodite",
            Self::Preview => "aphrodite-preview",
        }
    }
}
