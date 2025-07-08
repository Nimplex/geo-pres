use logger::LogStyle;
use logger::log_msg;

mod logger;

#[tokio::main]
async fn main() {
    log!([LogStyle::Bold, LogStyle::Italic], "DUPA", "{}", "aeiou");
    
    println!("Hello, world!");
}
