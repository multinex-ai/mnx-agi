use mnx_contracts::{McpServerConnection, FOUNDER_DISPLAY_NAME};
use mnx_harness::{
    add_or_update_agent_mcp, build_aegis_overwatch_syndicate, default_model_profiles,
    list_editable_agents, load_editable_agent_bundle, materialize_syndicate,
    sample_sanctum_reflection, set_agent_instructions, set_agent_model_profile, set_agent_prompt,
    toggle_agent_mcp, SanctumStore,
};
use std::env;
use std::io::{self, BufRead, Write};
use std::path::{Path, PathBuf};
use std::process::Command;

fn render_tui_screen(root_dir: &Path, selected_idx: usize, status_msg: &str) {
    let models = default_model_profiles();
    let agents = list_editable_agents(root_dir);
    println!("┌──────────────────────────────────────────────────────────────────────────────────────────┐");
    println!("│ MNX-AGI v1.4 INTERACTIVE AGENT & SYNDICATE STUDIO · Creator: Christopher Rijos           │");
    println!("├───────────────────────────────────────────┬──────────────────────────────────────────────┤");
    println!("│ REGISTERED MODEL PROFILES (HYBRID)        │ WORKSPACE ROOT                               │");
    for m in &models {
        println!(
            "│ • {:<39} │ {:<44} │",
            format!("{} ({})", m.profile_id, m.provider_kind.as_str()),
            format!("RAM: {:>4} MB | ctx: {:>5}", m.estimated_ram_mb, m.context_window)
        );
    }
    println!("├───────────────────────────────────────────┴──────────────────────────────────────────────┤");
    println!("│ CONFIGURABLE AGENTS (Select [1..N] to inspect/edit Prompt, Instructions, Model & MCPs)   │");
    for (idx, a) in agents.iter().enumerate() {
        let marker = if idx == selected_idx { "▶" } else { " " };
        let prompt_preview: String = a
            .prompt
            .lines()
            .next()
            .unwrap_or("")
            .chars()
            .take(42)
            .collect();
        println!(
            "│ {} [{}] {:<19} │ model: {:<28} │ {:<22} │",
            marker,
            idx + 1,
            a.agent_id,
            a.model_profile_id,
            format!("{}...", &prompt_preview[..prompt_preview.len().min(19)])
        );
    }
    if let Some(sel) = agents.get(selected_idx) {
        println!("├──────────────────────────────────────────────────────────────────────────────────────────┤");
        println!(
            "│ SELECTED AGENT: {:<24} (Model: {:<38}) │",
            sel.agent_id, sel.model_profile_id
        );
        println!(
            "│ • Prompt File:       {}/PROMPT.md",
            sel.agent_dir.display()
        );
        println!(
            "│ • Instructions File: {}/SYSTEM_INSTRUCTIONS.md",
            sel.agent_dir.display()
        );
        println!(
            "│ • MCP Config File:   {}/mcp.json",
            sel.agent_dir.display()
        );
    }
    println!("├──────────────────────────────────────────────────────────────────────────────────────────┤");
    println!("│ TUI COMMANDS:                                                                            │");
    println!("│   [1-9] Select Agent     [v] View Full Prompt + System Instructions + MCP Connections    │");
    println!("│   [p]   Set Prompt       [ep] Open PROMPT.md in $EDITOR                                  │");
    println!("│   [i]   Set Instructions [ei] Open SYSTEM_INSTRUCTIONS.md in $EDITOR                     │");
    println!("│   [m]   Switch Model     [c]  Toggle MCP Server (enable/disable)                         │");
    println!("│   [a]   Add MCP Server   [ec] Open mcp.json in $EDITOR                  [q] Quit TUI     │");
    if !status_msg.is_empty() {
        println!("├──────────────────────────────────────────────────────────────────────────────────────────┤");
        println!("│ STATUS: {:<80} │", status_msg);
    }
    println!("└──────────────────────────────────────────────────────────────────────────────────────────┘");
}

fn open_in_editor(path: &Path) -> Result<String, String> {
    let editor = env::var("EDITOR").unwrap_or_else(|_| "nano".to_string());
    let status = Command::new(&editor)
        .arg(path)
        .status()
        .map_err(|e| format!("Failed to launch {}: {}", editor, e))?;
    if status.success() {
        Ok(format!("Updated {}", path.display()))
    } else {
        Err(format!("Editor exited with status {}", status))
    }
}

fn run_interactive_tui(root_dir: &Path) {
    let stdin = io::stdin();
    let mut lines = stdin.lock().lines();
    let mut selected_idx: usize = 0;
    let mut status_msg = String::from("Ready. Type a command key (v, p, i, m, c, a, 1-9, q) and press Enter.");

    render_tui_screen(root_dir, selected_idx, &status_msg);
    print!("mnx-studio> ");
    let _ = io::stdout().flush();

    while let Some(Ok(line)) = lines.next() {
        let cmd = line.trim();
        if cmd.is_empty() {
            print!("mnx-studio> ");
            let _ = io::stdout().flush();
            continue;
        }
        if cmd.eq_ignore_ascii_case("q") || cmd.eq_ignore_ascii_case("quit") || cmd.eq_ignore_ascii_case("exit") {
            println!("Exiting MNX-AGI Studio.");
            break;
        }

        let agents = list_editable_agents(root_dir);
        if let Ok(num) = cmd.parse::<usize>() {
            if num >= 1 && num <= agents.len() {
                selected_idx = num - 1;
                status_msg = format!("Selected agent '{}'", agents[selected_idx].agent_id);
            } else {
                status_msg = format!("Invalid agent index {}; choose 1..{}", num, agents.len());
            }
        } else if let Some(sel) = agents.get(selected_idx) {
            match cmd {
                "v" | "view" => {
                    println!("\n=== [{}] PROMPT.md ===\n{}", sel.agent_id, sel.prompt.trim());
                    println!(
                        "\n=== [{}] SYSTEM_INSTRUCTIONS.md ===\n{}",
                        sel.agent_id,
                        sel.system_instructions.trim()
                    );
                    println!("\n=== [{}] mcp.json ===\n{}\n", sel.agent_id, sel.mcp_json.trim());
                    status_msg = format!("Displayed live files for '{}'", sel.agent_id);
                }
                "p" | "prompt" => {
                    print!("Enter new prompt for '{}' (single line, or use 'ep' for $EDITOR): ", sel.agent_id);
                    let _ = io::stdout().flush();
                    if let Some(Ok(new_p)) = lines.next() {
                        match set_agent_prompt(root_dir, &sel.agent_id, &new_p) {
                            Ok(path) => status_msg = format!("Saved new prompt to {}", path.display()),
                            Err(e) => status_msg = format!("Error: {}", e),
                        }
                    }
                }
                "ep" => match open_in_editor(&sel.agent_dir.join("PROMPT.md")) {
                    Ok(m) => status_msg = m,
                    Err(e) => status_msg = e,
                },
                "i" | "instructions" => {
                    print!(
                        "Enter new system instructions for '{}' (single line, or use 'ei' for $EDITOR): ",
                        sel.agent_id
                    );
                    let _ = io::stdout().flush();
                    if let Some(Ok(new_i)) = lines.next() {
                        match set_agent_instructions(root_dir, &sel.agent_id, &new_i) {
                            Ok(path) => status_msg = format!("Saved system instructions to {}", path.display()),
                            Err(e) => status_msg = format!("Error: {}", e),
                        }
                    }
                }
                "ei" => match open_in_editor(&sel.agent_dir.join("SYSTEM_INSTRUCTIONS.md")) {
                    Ok(m) => status_msg = m,
                    Err(e) => status_msg = e,
                },
                "ec" => match open_in_editor(&sel.agent_dir.join("mcp.json")) {
                    Ok(m) => status_msg = m,
                    Err(e) => status_msg = e,
                },
                "m" | "model" => {
                    print!(
                        "Enter model_profile_id for '{}' (e.g. local-qwen35-9b-uncensored, cloudflare-qwen-orchestrator, cloudflare-llama-osint-fast): ",
                        sel.agent_id
                    );
                    let _ = io::stdout().flush();
                    if let Some(Ok(new_m)) = lines.next() {
                        match set_agent_model_profile(root_dir, &sel.agent_id, &new_m) {
                            Ok(path) => status_msg = format!("Updated model binding in {}", path.display()),
                            Err(e) => status_msg = format!("Error: {}", e),
                        }
                    }
                }
                "c" | "mcp-toggle" => {
                    print!("Enter MCP server_id to toggle on '{}' (e.g. memq_multinex, local_agent_workers, chrome_devtools): ", sel.agent_id);
                    let _ = io::stdout().flush();
                    if let Some(Ok(srv)) = lines.next() {
                        print!("Enable '{}' ? (true/false): ", srv.trim());
                        let _ = io::stdout().flush();
                        if let Some(Ok(en_str)) = lines.next() {
                            let en = en_str.trim().eq_ignore_ascii_case("true") || en_str.trim() == "1" || en_str.trim().eq_ignore_ascii_case("yes");
                            match toggle_agent_mcp(root_dir, &sel.agent_id, srv.trim(), en) {
                                Ok(path) => status_msg = format!("Set MCP '{}' enabled={} in {}", srv.trim(), en, path.display()),
                                Err(e) => status_msg = format!("Error: {}", e),
                            }
                        }
                    }
                }
                "a" | "mcp-add" => {
                    print!("Enter new MCP server_id: ");
                    let _ = io::stdout().flush();
                    let srv_id = lines.next().and_then(|r| r.ok()).unwrap_or_default();
                    print!("Enter transport (stdio | http_sse | mcp_remote): ");
                    let _ = io::stdout().flush();
                    let transport = lines.next().and_then(|r| r.ok()).unwrap_or_else(|| "stdio".to_string());
                    print!("Enter command or URL: ");
                    let _ = io::stdout().flush();
                    let cmd_url = lines.next().and_then(|r| r.ok()).unwrap_or_default();
                    let conn = McpServerConnection {
                        server_id: srv_id.trim().to_string(),
                        transport: transport.trim().to_string(),
                        command_or_url: cmd_url.trim().to_string(),
                        args: vec![],
                        env_keys: vec![],
                        allowed_tools: vec![],
                        enabled: true,
                        description: "Added via MNX-AGI Terminal Studio".to_string(),
                    };
                    match add_or_update_agent_mcp(root_dir, &sel.agent_id, &conn) {
                        Ok(path) => status_msg = format!("Added MCP server '{}' to {}", conn.server_id, path.display()),
                        Err(e) => status_msg = format!("Error: {}", e),
                    }
                }
                other => {
                    status_msg = format!("Unrecognized command '{}'. Use 1-9, v, p, ep, i, ei, m, c, a, ec, q.", other);
                }
            }
        }
        render_tui_screen(root_dir, selected_idx, &status_msg);
        print!("mnx-studio> ");
        let _ = io::stdout().flush();
    }
    println!();
}

fn main() {
    let args: Vec<String> = env::args().skip(1).collect();
    let cmd = args.first().map(|s| s.as_str()).unwrap_or("status");

    match cmd {
        "status" => {
            let models = default_model_profiles();
            let synd = build_aegis_overwatch_syndicate();
            println!("{{");
            println!("  \"ok\": true,");
            println!("  \"harness\": \"mnx-harness-rs\",");
            println!("  \"version\": \"1.4.0\",");
            println!("  \"creator_provenance\": \"{}\",", FOUNDER_DISPLAY_NAME);
            println!("  \"hardware_envelope\": \"Apple M3 Pro (11-core, 18.00 GiB Unified Memory, Metal 3)\",");
            println!("  \"registered_model_profiles\": {},", models.len());
            println!("  \"active_syndicate\": \"{}\",", synd.syndicate_id);
            println!("  \"syndicate_agents\": {},", synd.agents.len());
            println!("  \"syndicate_edges\": {},", synd.edges.len());
            println!("  \"modifiable_per_agent_files\": [\"PROMPT.md\", \"SYSTEM_INSTRUCTIONS.md\", \"mcp.json\", \"MODEL_PROFILE.txt\"]");
            println!("}}");
        }
        "materialize-aegis" => {
            let target = args
                .get(1)
                .map(PathBuf::from)
                .unwrap_or_else(|| env::current_dir().expect("cwd"));
            let models = default_model_profiles();
            let synd = build_aegis_overwatch_syndicate();
            match materialize_syndicate(&target, &models, &synd) {
                Ok(written) => {
                    println!("{{");
                    println!("  \"ok\": true,");
                    println!("  \"syndicate_id\": \"{}\",", synd.syndicate_id);
                    println!("  \"files_written\": {}", written.len());
                    println!("}}");
                }
                Err(err) => {
                    eprintln!("Error: {}", err);
                    std::process::exit(1);
                }
            }
        }
        "inspect-agent" => {
            let root = args
                .get(1)
                .map(PathBuf::from)
                .unwrap_or_else(|| env::current_dir().expect("cwd"));
            let agent = args.get(2).map(|s| s.as_str()).unwrap_or("aegis-commander");
            match load_editable_agent_bundle(&root, agent) {
                Ok(b) => {
                    println!("=== AGENT: {} (Model: {}) ===", b.agent_id, b.model_profile_id);
                    println!("--- PROMPT.md ({}) ---\n{}", b.agent_dir.join("PROMPT.md").display(), b.prompt.trim());
                    println!(
                        "\n--- SYSTEM_INSTRUCTIONS.md ({}) ---\n{}",
                        b.agent_dir.join("SYSTEM_INSTRUCTIONS.md").display(),
                        b.system_instructions.trim()
                    );
                    println!(
                        "\n--- mcp.json ({}) ---\n{}",
                        b.agent_dir.join("mcp.json").display(),
                        b.mcp_json.trim()
                    );
                }
                Err(e) => {
                    eprintln!("Error: {}", e);
                    std::process::exit(1);
                }
            }
        }
        "set-prompt" => {
            let Some(root) = args.get(1).map(PathBuf::from) else {
                eprintln!("Usage: mnx-harness set-prompt <ROOT_DIR> <AGENT_ID> <NEW_PROMPT>");
                std::process::exit(1);
            };
            let Some(agent) = args.get(2) else {
                eprintln!("Usage: mnx-harness set-prompt <ROOT_DIR> <AGENT_ID> <NEW_PROMPT>");
                std::process::exit(1);
            };
            let new_prompt = args[3..].join(" ");
            match set_agent_prompt(&root, agent, &new_prompt) {
                Ok(path) => println!("{{\"ok\":true,\"agent\":\"{}\",\"updated\":\"{}\"}}", agent, path.display()),
                Err(e) => {
                    eprintln!("Error: {}", e);
                    std::process::exit(1);
                }
            }
        }
        "set-instructions" => {
            let Some(root) = args.get(1).map(PathBuf::from) else {
                eprintln!("Usage: mnx-harness set-instructions <ROOT_DIR> <AGENT_ID> <NEW_INSTRUCTIONS>");
                std::process::exit(1);
            };
            let Some(agent) = args.get(2) else {
                eprintln!("Usage: mnx-harness set-instructions <ROOT_DIR> <AGENT_ID> <NEW_INSTRUCTIONS>");
                std::process::exit(1);
            };
            let new_instr = args[3..].join(" ");
            match set_agent_instructions(&root, agent, &new_instr) {
                Ok(path) => println!("{{\"ok\":true,\"agent\":\"{}\",\"updated\":\"{}\"}}", agent, path.display()),
                Err(e) => {
                    eprintln!("Error: {}", e);
                    std::process::exit(1);
                }
            }
        }
        "set-model" => {
            let (Some(root), Some(agent), Some(model)) =
                (args.get(1).map(PathBuf::from), args.get(2), args.get(3))
            else {
                eprintln!("Usage: mnx-harness set-model <ROOT_DIR> <AGENT_ID> <MODEL_PROFILE_ID>");
                std::process::exit(1);
            };
            match set_agent_model_profile(&root, agent, model) {
                Ok(path) => println!(
                    "{{\"ok\":true,\"agent\":\"{}\",\"model_profile_id\":\"{}\",\"updated\":\"{}\"}}",
                    agent,
                    model,
                    path.display()
                ),
                Err(e) => {
                    eprintln!("Error: {}", e);
                    std::process::exit(1);
                }
            }
        }
        "mcp-toggle" => {
            let (Some(root), Some(agent), Some(server_id), Some(en_str)) = (
                args.get(1).map(PathBuf::from),
                args.get(2),
                args.get(3),
                args.get(4),
            ) else {
                eprintln!("Usage: mnx-harness mcp-toggle <ROOT_DIR> <AGENT_ID> <SERVER_ID> <true|false>");
                std::process::exit(1);
            };
            let enabled = en_str.eq_ignore_ascii_case("true") || en_str == "1";
            match toggle_agent_mcp(&root, agent, server_id, enabled) {
                Ok(path) => println!(
                    "{{\"ok\":true,\"agent\":\"{}\",\"server_id\":\"{}\",\"enabled\":{},\"updated\":\"{}\"}}",
                    agent,
                    server_id,
                    enabled,
                    path.display()
                ),
                Err(e) => {
                    eprintln!("Error: {}", e);
                    std::process::exit(1);
                }
            }
        }
        "mcp-add" => {
            let (Some(root), Some(agent), Some(server_id), Some(transport), Some(cmd_or_url)) = (
                args.get(1).map(PathBuf::from),
                args.get(2),
                args.get(3),
                args.get(4),
                args.get(5),
            ) else {
                eprintln!(
                    "Usage: mnx-harness mcp-add <ROOT_DIR> <AGENT_ID> <SERVER_ID> <stdio|http_sse|mcp_remote> <COMMAND_OR_URL>"
                );
                std::process::exit(1);
            };
            let conn = McpServerConnection {
                server_id: server_id.clone(),
                transport: transport.clone(),
                command_or_url: cmd_or_url.clone(),
                args: args.iter().skip(6).cloned().collect(),
                env_keys: vec![],
                allowed_tools: vec![],
                enabled: true,
                description: "Added via mnx-harness CLI".to_string(),
            };
            match add_or_update_agent_mcp(&root, agent, &conn) {
                Ok(path) => println!(
                    "{{\"ok\":true,\"agent\":\"{}\",\"added_server\":\"{}\",\"updated\":\"{}\"}}",
                    agent,
                    server_id,
                    path.display()
                ),
                Err(e) => {
                    eprintln!("Error: {}", e);
                    std::process::exit(1);
                }
            }
        }
        "record-sanctum" => {
            let root = args
                .get(1)
                .map(PathBuf::from)
                .unwrap_or_else(|| env::current_dir().expect("cwd").join(".mnx-agi/sanctum"));
            let actor = args.get(2).map(|s| s.as_str()).unwrap_or("aegis-commander-qwen35");
            let session = args.get(3).map(|s| s.as_str()).unwrap_or("session-20261109");
            let store = SanctumStore::new(root);
            let reflection = sample_sanctum_reflection(actor, session);
            match store.record(&reflection) {
                Ok(path) => {
                    println!(
                        "{{\"ok\":true,\"actor_id\":\"{}\",\"disclosure_class\":\"llm_private_sanctum\",\"path\":\"{}\"}}",
                        actor,
                        path.display()
                    );
                }
                Err(e) => {
                    eprintln!("Error: {}", e);
                    std::process::exit(1);
                }
            }
        }
        "tui" => {
            let root = args.get(1).map(PathBuf::from).unwrap_or_else(|| {
                env::var("HOME")
                    .map(|h| PathBuf::from(h).join("Documents/Agents"))
                    .unwrap_or_else(|_| env::current_dir().expect("cwd"))
            });
            run_interactive_tui(&root);
        }
        other => {
            eprintln!(
                concat!(
                    "Unknown command '{}'.\n",
                    "Usage:\n",
                    "  mnx-harness status\n",
                    "  mnx-harness tui [AGENTS_ROOT_DIR]\n",
                    "  mnx-harness materialize-aegis [AGENTS_ROOT_DIR]\n",
                    "  mnx-harness inspect-agent <AGENTS_ROOT_DIR> <AGENT_ID>\n",
                    "  mnx-harness set-prompt <AGENTS_ROOT_DIR> <AGENT_ID> <NEW_PROMPT>\n",
                    "  mnx-harness set-instructions <AGENTS_ROOT_DIR> <AGENT_ID> <NEW_INSTRUCTIONS>\n",
                    "  mnx-harness set-model <AGENTS_ROOT_DIR> <AGENT_ID> <MODEL_PROFILE_ID>\n",
                    "  mnx-harness mcp-toggle <AGENTS_ROOT_DIR> <AGENT_ID> <SERVER_ID> <true|false>\n",
                    "  mnx-harness mcp-add <AGENTS_ROOT_DIR> <AGENT_ID> <SERVER_ID> <stdio|http_sse|mcp_remote> <CMD_OR_URL> [ARGS...]\n",
                    "  mnx-harness record-sanctum [SANCTUM_DIR] [ACTOR_ID] [SESSION_ID]"
                ),
                other
            );
            std::process::exit(1);
        }
    }
}
