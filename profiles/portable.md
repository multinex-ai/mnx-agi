# Portable profile

Adopt the core without selecting a language, model provider, runtime engine, database, UI library, branch naming scheme, or persona vocabulary. Use existing project conventions. The default execution context is a single local realm with no exports.

Memory mode is local unless the host has a configured and verified MemQ connection. Optional recall may degrade to local evidence; protected writes and federation require verified scope. Host adapters supply tool discovery and authentication. Model selection follows task capability, approved data handling, latency, and budget.

Use short closeouts for small tasks and durable checkpoints for long work. Load only the skills relevant to the task. At task start, the adopting agent resolves the active realm and applicable policy; it does not eagerly load every realm or every skill.
