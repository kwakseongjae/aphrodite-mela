# Aphrodite v0.2.5 — release notes

The update card stays still while a download moves, and it asks before it restarts.

## What's new since v0.2.4

**The update card no longer blinks as the download advances**
- Each percent used to replace the whole card, and the card's entrance played again every time.
  That read as the card flashing for the length of the download.
- The percent and the bar now change on the card that is already open.

**Restart waits for a yes**
- Install still fetches the new version and puts it in place.
- When that finishes, the card asks whether to restart now. Later leaves this session as it is;
  the new version starts the next time Aphrodite is opened.
