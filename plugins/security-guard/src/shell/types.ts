/** A word with the quote state of each of its characters; `quoting[i]` describes `text[i]`. */
export type Word = { text: string; quoting: string };

export type ShellToken = Word & {
  /** True for control operators and redirection operators. */
  sep: boolean;
  /** True when this separator is a redirection operator; the word after it is its target. */
  redirect: boolean;
  /** True for here-document data, which is not shell command syntax but may contain command substitutions. */
  heredoc?: boolean;
  /**
   * True for a whole `[[ ... ]]` test expression, `[[` and `]]` included. It runs no command of its own, so
   * command resolution skips it like a reserved word, but the substitutions inside it still run.
   */
  testExpression?: boolean;
  /**
   * For here-document data, the index of the first token of the command whose redirection reads the body.
   * The body arrives after the newline that ends the command line, so this is its only link to its reader.
   */
  heredocOwner?: number;
};
