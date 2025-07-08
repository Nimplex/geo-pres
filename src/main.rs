use logger::{log_msg, LogStyle};

mod logger;

#[tokio::main]
async fn main() {
    log!([LogStyle::Bold, LogStyle::Italic], "test", "{}\n{}\n{}", "test1", "test2", "test3\ntest4");
}
