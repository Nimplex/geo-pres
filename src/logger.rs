#[derive(Clone, Copy)]
pub enum LogStyle {
    Clear = 0,
    Bold = 1,
    Italic = 3,
    Red = 31,
    Green = 32,
    Yellow = 33,
    Blue = 34,
    Purple = 35,
    Cyan = 36,
    Grey = 90,
}

impl std::fmt::Display for LogStyle {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "\x1b[{}m", *self as usize)
    }
}

impl From<LogStyle> for String {
    fn from(value: LogStyle) -> Self {
        format!("\x1b[{}m", value as usize)
    }
}

pub(crate) fn log_msg<const N: usize>(colors: [LogStyle; N], prefix: &str, message: String) {
    let lines: Vec<_> = message.lines().collect();
    let Some((&first, rest)) = lines.split_first() else {
        return;
    };

    println!(
        "[{}{prefix:15}{}] {first}",
        colors
            .iter()
            .map(|x| Into::<String>::into(*x))
            .collect::<String>(),
        LogStyle::Clear,
    );

    for &line in rest {
        println!("................. {line}",);
    }
}

#[macro_export]
macro_rules! log {
    ($colors:expr, $prefix:expr, $($arg:tt)*) => {
        log_msg($colors, $prefix, format!("{}", format_args!($($arg)*)))
    };
}
