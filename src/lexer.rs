#[derive(Debug)]
enum Token<'s> {
    Special(&'s str), // #? statements
    String(&'s str),
}

struct Lexer<'s> {
    input: &'s str,
    pos: usize,
}

impl<'s> Lexer<'s> {
    fn new(input: &'s str) -> Self {
        Lexer { input, pos: 0 }
    }

    fn peek_char(&self) -> Option<char> {
        self.input[self.pos..].chars().next()
    }

    fn read_char(&mut self) -> Option<char> {
        let c = self.peek_char()?;
        self.pos += c.len_utf8();
        Some(c)
    }

    pub fn next_token(&mut self) -> Option<Token<'s>> {
        while let Some(chr) = self.read_char() {
            match chr {
                '#' => match self.peek_char() {
                    Some('?') => {
                        let start = self.pos - chr.len_utf8();
                        self.read_char(); // consume '?'

                        while let Some(next) = self.peek_char() {
                            if next == '\n' {
                                break;
                            }
                            self.read_char();
                        }

                        let slice = &self.input[start..self.pos];
                        return Some(Token::Special(slice));
                    }
                    _ => {
                        let line_start =
                            self.pos == 1 || self.input[..self.pos - 1].ends_with('\n');
                        if line_start {
                            while let Some(next) = self.peek_char() {
                                if next == '\n' {
                                    break;
                                }
                                self.read_char();
                            }
                            continue;
                        } else {
                            let start = self.pos - chr.len_utf8();
                            while let Some(next) = self.peek_char() {
                                if next == '\n' {
                                    break;
                                }
                                self.read_char();
                            }
                            let slice = &self.input[start..self.pos];
                            return Some(Token::String(slice));
                        }
                    }
                },
                '\n' => continue,
                _ => {
                    let start = self.pos - chr.len_utf8();
                    while let Some(next) = self.peek_char() {
                        if next == '\n' {
                            break;
                        }
                        self.read_char();
                    }
                    let slice = &self.input[start..self.pos];
                    return Some(Token::String(slice));
                }
            }
        }
        None
    }
}
