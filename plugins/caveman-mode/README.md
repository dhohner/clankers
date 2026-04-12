# Caveman Mode Plugin

Makes replies shorter and more direct with caveman-style wording.

It includes one quick mode-switch skill so you can switch between normal caveman, ultra caveman, or off in chat.

## Modes

- `normal` - short, direct, easy to scan
- `ultra` - maximum compression, very few words
- `off` - normal replies again

## Skill

- `/caveman-mode:mode`

## Behavior

- Starts each session in ultra caveman mode by default
- Keeps ultra caveman active every response until the user says `stop caveman` or `normal mode`
- Keeps code and commit messages unchanged
- Uses clear normal wording for security-sensitive writing or high-risk confirmations, then resumes caveman
- Lets you switch style in chat without changing project files

Example prompts:

- `Use caveman-mode:mode for shorter replies in this chat.`
- `Use caveman-mode:mode with normal caveman mode.`
- `Use caveman-mode:mode and turn it off.`

## Credits

Inspired by [caveman](https://github.com/JuliusBrussee/caveman) by [Julius Brussee](https://github.com/JuliusBrussee).

## Authors

[dhohner](https://github.com/dhohner)
