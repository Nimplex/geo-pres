use std::str::FromStr;

#[derive(Debug)]
pub enum ParserError {
    InvalidCommand,
    InvalidLineAmount { expected: usize, got: usize },
    InvalidArguments { expected: String, got: String },
    NoInput,
}

#[derive(Debug)]
pub enum Arg<'a> {
    Str(&'a str),
    Num(i32),
}

pub type Arguments<'a> = Vec<Arg<'a>>;

#[derive(Debug)]
pub enum CommandType {
    Head,
    DefineLayout,
    Align,
}

pub trait ToArg<'a> {
    fn to_arg(&self) -> Arg<'a>;
}

impl<'a> ToArg<'a> for &'a str {
    fn to_arg(&self) -> Arg<'a> {
        self.parse::<i32>().map_or(Arg::Str(self), Arg::Num)
    }
}

impl FromStr for CommandType {
    type Err = ParserError;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "head" => Ok(CommandType::Head),
            "define_layout" => Ok(CommandType::DefineLayout),
            "align" => Ok(CommandType::Align),
            _ => Err(ParserError::InvalidCommand),
        }
    }
}

#[derive(Debug)]
pub enum Statement<'a> {
    Command(CommandType, Arguments<'a>), // #? statements
    Text(&'a str),
}

pub struct Parser;

impl Parser {
    pub fn parse_line(input: &str) -> Result<Statement<'_>, ParserError> {
        let count = input.lines().count();
        if count != 1 {
            return Err(ParserError::InvalidLineAmount {
                expected: 1,
                got: count,
            });
        };

        if input.starts_with("#?") {
            let cmd: Vec<&str> = input.split_whitespace().skip(1).collect();

            let Some((&first, rest)) = cmd.split_first() else {
                return Err(ParserError::NoInput);
            };

            let as_command: CommandType = first.parse()?;
            let args: Arguments = rest.iter().map(|&x| x.to_arg()).collect();

            return Ok(Statement::Command(as_command, args));
        }

        Ok(Statement::Text(input.trim()))
    }

    pub fn parse_file(input: &str) -> Result<Vec<Statement<'_>>, ParserError> {
        input
            .trim()
            .lines()
            .filter(|line| !line.is_empty())
            .map(Parser::parse_line)
            .collect()
    }
}
