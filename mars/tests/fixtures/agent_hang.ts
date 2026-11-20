// An agent that never finishes. The interval keeps the event loop alive so the runtime does not exit early.
setInterval(() => {}, 1000);
await new Promise(() => {});
