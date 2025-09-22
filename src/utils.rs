use crate::{logger::LogStyle, parser::City};
use std::{fs, io, num::ParseIntError, path::Path};

macro_rules! join_error {
    ($visibility: vis enum $name: ident { $($memb: ident($err: ty)),* $(,)?}) => {
        #[derive(Debug)]
        #[allow(dead_code)]
        $visibility enum $name {
            $($memb($err)),*
        }

        $(
            impl From<$err> for $name {
                fn from(value: $err) -> $name {
                    $name::$memb(value)
                }
            }
        )*

        impl std::error::Error for $name {}
        impl std::fmt::Display for $name {
            fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                match self {
                    $(
                        $name::$memb(error) => write!(f, "{error}"),
                    )*
                }
            }
        }
    }
}

join_error! {
    pub enum AppError {
        UsvgError(resvg::usvg::Error),
        ImageError(image::error::ImageError),
        Io(io::Error),
        Request(reqwest::Error),
        InvalidFont(ab_glyph::InvalidFont),
        ParseIntError(ParseIntError),
        Other(String),
    }
}

pub type AppResult<T> = Result<T, AppError>;

#[must_use]
#[derive(Clone, Debug)]
pub struct ReturnReport {
    pub job_name: String,
    pub duration: std::time::Duration,
    pub amount_ok: usize,
    pub amount_err: usize,
}

impl std::fmt::Display for ReturnReport {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(
            f,
            "{}{}{:18}{} => {}{:11.4}{} s, {}{:4}{} OK, {}{:4}{} error{}",
            LogStyle::Purple,
            LogStyle::Bold,
            self.job_name,
            LogStyle::Clear,
            LogStyle::Cyan,
            self.duration.as_secs_f32(),
            LogStyle::Clear,
            LogStyle::Green,
            self.amount_ok,
            LogStyle::Clear,
            LogStyle::Red,
            self.amount_err,
            LogStyle::Clear,
            if self.amount_err == 1 { "" } else { "s" }
        )
    }
}

impl std::ops::Add for ReturnReport {
    type Output = Self;

    fn add(self, rhs: Self) -> Self::Output {
        Self {
            job_name: "TOTAL".into(),
            duration: self.duration + rhs.duration,
            amount_ok: self.amount_ok + rhs.amount_ok,
            amount_err: self.amount_err + rhs.amount_err,
        }
    }
}

pub fn ensure_exists(path: &Path) -> AppResult<()> {
    if !path.exists() {
        fs::create_dir_all(path)?;
    }
    Ok(())
}

pub fn format_file_name_parts(city_identifier: &str, city_name: &str) -> String {
    format!(
        "{}+{}",
        city_identifier.replace(' ', "_"),
        city_name.replace(' ', "_")
    )
}

pub fn format_file_name(city: &City) -> String {
    format_file_name_parts(&city.identifier, &city.name)
}

pub fn file_stem(path: &std::path::Path) -> Option<String> {
    Some(path.file_stem()?.to_str()?.to_owned())
}

pub fn capitalize(s: &str) -> String {
    let mut c = s.chars();
    match c.next() {
        None => String::new(),
        Some(f) => f.to_uppercase().collect::<String>() + c.as_str(),
    }
}
