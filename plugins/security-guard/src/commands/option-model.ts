/**
 * The options of a command that runs another one. `value` options take the following word, `flag` options
 * stand alone, and `numeric` allows a bare adjustment such as `nice -10`. A `stateful` option moves the
 * working directory or root, or writes a file of its own, so the wrapped command's operands stop describing
 * every path the call affects; `alwaysStateful` says the same about the command whatever its options are.
 */
export type OptionModel = {
  value: ReadonlySet<string>;
  flag: ReadonlySet<string>;
  numeric?: boolean;
  stateful?: ReadonlySet<string>;
  alwaysStateful?: boolean;
  /** Options after which the wrapper only reports on the following word and runs nothing, such as `command -v`. */
  inspect?: ReadonlySet<string>;
  /** Non-option operands the command takes before the command word, such as `timeout`'s duration. */
  operands?: number;
};
