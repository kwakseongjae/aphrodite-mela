# Aphrodite v0.2.6 — release notes

When the window is the list of projects, the channel stops describing a page that is not on screen.

## What's new since v0.2.5

**Home is Home on the channel too**
- The window could be the project list while a contract and a page picture still described whatever project was last in memory, as if that page were the canvas.
- Contract, tokens and a page picture now say the window is on Home and do not hand that page over. The last project's name is kept, and it is marked as not on screen.
- Changing that hidden project from the channel is refused until a project is actually open. Clicking the list to open one still works.
