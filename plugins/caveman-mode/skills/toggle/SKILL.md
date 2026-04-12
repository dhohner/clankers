---
name: toggle
description: Switch caveman mode for current chat or session. Supports normal, ultra, and off, and defaults to ultra when request does not specify mode.
allowed-tools: Bash, Read, Write, Edit
---

# Caveman Mode

Switch caveman mode for this chat/session.

## Instructions

1. Do not modify files.
2. Inspect the user's current request and choose the requested mode:
   - `off` if they ask to disable caveman mode, turn it off, or reply normally again.
   - `normal` if they ask for normal caveman mode, full mode, less compression, or concise caveman replies.
   - Otherwise use `ultra`.
3. For the rest of the current response, apply the selected mode:
   - `ultra`: aggressive trimming, fragments preferred, abbreviations allowed when clear, fewest words that keep technical accuracy.
   - `normal`: terse, direct, easy to scan, less compressed than `ultra`.
   - `off`: reply normally.
4. Keep code blocks and commit messages unchanged. For security-sensitive text, destructive confirmations, or step-by-step instructions where fragments could confuse, switch to clear normal wording, then resume caveman.
5. Confirm the selected mode in one short line.
