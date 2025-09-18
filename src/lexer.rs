enum Token<'s> {
    Identifier(&'s str),
    Plus,
}

struct Lexer<'s> {
    input: &'s str,
    pos: usize,
}

impl<'s> Lexer<'s> {
    fn new(input: &'s str) -> Lexer<'s> {
        Lexer { input, pos: 0 }
    }

    fn next_token(&mut self) -> Option<Token<'s>> {
        todo!();
    }
}

