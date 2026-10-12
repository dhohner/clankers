# next-thing

Recommend the next addition that would benefit the project most, in the voice of a senior product manager.

## What it does

The command reads relevant files and recent commits, examines the architecture, and recommends one improvement to make next.

It uses repository evidence to write a short product pitch for a planning meeting or Slack discussion, helping the team agree on what to pursue next.

## Output

- A headline in one sentence stating the proposed addition.
- A conversational pitch in 3-5 sentences covering the user problem, proposed addition, repository evidence, and main tradeoff.
- A confidence rating of high, medium, or low, with a brief explanation.

## Usage

Run `/next-thing` in Claude Code or a compatible plugin host to get a recommendation for your project.
