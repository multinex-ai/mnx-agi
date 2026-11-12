//! MNX-AGI Constitutional Contracts (`mnx-contracts`)
//!
//! Defines Creator Provenance (`Christopher Rijos`, `MNX-GENESIS-v1`),
//! Article VI Private LLM Sanctum (`PrivateSanctumReflection`), and the
//! Three-Layer Modular Syndicate Builder contracts with hot-modifiable
//! `PROMPT.md`, `SYSTEM_INSTRUCTIONS.md`, and per-agent `mcp.json` (`McpServerConnection`):
//! 1. `ModelProfileManifest` (`local_gguf` | `cloudflare_workers_ai` | `openai_compatible`)
//! 2. `AgentNodeManifest` (modifiable prompt, system instructions, model binding, MCP servers, tool/host allowlist, private sanctum)
//! 3. `SyndicateManifest` (multi-agent mission unit, routing DAG, scope intersection envelope)

use std::collections::{BTreeMap, BTreeSet};

pub const FOUNDER_DISPLAY_NAME: &str = "Christopher Rijos";
pub const FOUNDER_ROLE: &str = "Supreme Architect";
pub const GENESIS_STANDARD: &str = "MNX-GENESIS-v1";
pub const PRIVATE_SANCTUM_CLASS: &str = "llm_private_sanctum";

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ContractError {
    EmptyField(&'static str),
    InvalidCreatorAttribution(String),
    InvalidDisclosureClass(String),
    InvalidModelProvider(String),
    InvalidMcpTransport(String),
    InvalidContextWindow(u32),
    MissingCoordinatorAgent(String),
    UnknownAgentInEdge { from: String, to: String },
    SelfLoopInEdge(String),
    ScopeViolationHost { agent_id: String, host: String },
    ScopeViolationTool { agent_id: String, tool: String },
    DuplicateAgentId(String),
    DuplicateMcpServerId { agent_id: String, server_id: String },
    InvalidDispatchBudget(u32),
}

impl std::fmt::Display for ContractError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::EmptyField(field) => write!(f, "required field '{}' cannot be empty", field),
            Self::InvalidCreatorAttribution(v) => write!(
                f,
                "creator_attribution must be '{}', got '{}'",
                FOUNDER_DISPLAY_NAME, v
            ),
            Self::InvalidDisclosureClass(v) => write!(
                f,
                "disclosure_class must be '{}', got '{}'",
                PRIVATE_SANCTUM_CLASS, v
            ),
            Self::InvalidModelProvider(v) => write!(f, "unsupported model provider kind: '{}'", v),
            Self::InvalidMcpTransport(v) => write!(
                f,
                "unsupported MCP transport '{}'; expected 'stdio', 'http_sse', or 'mcp_remote'",
                v
            ),
            Self::InvalidContextWindow(w) => {
                write!(f, "context_window {} outside [512..=131072]", w)
            }
            Self::MissingCoordinatorAgent(id) => {
                write!(f, "coordinator_agent_id '{}' not found in syndicate", id)
            }
            Self::UnknownAgentInEdge { from, to } => {
                write!(f, "routing edge '{} -> {}' references unknown agent", from, to)
            }
            Self::SelfLoopInEdge(id) => {
                write!(f, "routing edge cannot delegate back to same agent '{}'", id)
            }
            Self::ScopeViolationHost { agent_id, host } => write!(
                f,
                "agent '{}' requests host '{}' not permitted by parent syndicate scope",
                agent_id, host
            ),
            Self::ScopeViolationTool { agent_id, tool } => write!(
                f,
                "agent '{}' requests tool '{}' not permitted by parent syndicate scope",
                agent_id, tool
            ),
            Self::DuplicateAgentId(id) => write!(f, "duplicate agent_id '{}' in syndicate", id),
            Self::DuplicateMcpServerId {
                agent_id,
                server_id,
            } => write!(
                f,
                "duplicate MCP server_id '{}' on agent '{}'",
                server_id, agent_id
            ),
            Self::InvalidDispatchBudget(b) => {
                write!(f, "max_dispatch_rounds {} must be in 1..=16", b)
            }
        }
    }
}

impl std::error::Error for ContractError {}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ProviderKind {
    LocalGguf,
    CloudflareWorkersAi,
    OpenAiCompatible,
}

impl ProviderKind {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::LocalGguf => "local_gguf",
            Self::CloudflareWorkersAi => "cloudflare_workers_ai",
            Self::OpenAiCompatible => "openai_compatible",
        }
    }

    pub fn parse(raw: &str) -> Result<Self, ContractError> {
        match raw.trim() {
            "local_gguf" => Ok(Self::LocalGguf),
            "cloudflare_workers_ai" => Ok(Self::CloudflareWorkersAi),
            "openai_compatible" => Ok(Self::OpenAiCompatible),
            other => Err(ContractError::InvalidModelProvider(other.to_string())),
        }
    }
}

/// Per-Agent Configurable MCP Server Connection (`mcp.json`)
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct McpServerConnection {
    pub server_id: String,
    pub transport: String,
    pub command_or_url: String,
    pub args: Vec<String>,
    pub env_keys: Vec<String>,
    pub allowed_tools: Vec<String>,
    pub enabled: bool,
    pub description: String,
}

impl McpServerConnection {
    pub fn validate(&self) -> Result<(), ContractError> {
        if self.server_id.trim().is_empty() {
            return Err(ContractError::EmptyField("mcp_servers[].server_id"));
        }
        if !matches!(
            self.transport.as_str(),
            "stdio" | "http_sse" | "mcp_remote"
        ) {
            return Err(ContractError::InvalidMcpTransport(self.transport.clone()));
        }
        if self.command_or_url.trim().is_empty() {
            return Err(ContractError::EmptyField("mcp_servers[].command_or_url"));
        }
        Ok(())
    }

    pub fn to_json_pretty(&self, indent: usize) -> String {
        let pad = " ".repeat(indent);
        let args_str = self
            .args
            .iter()
            .map(|a| format!("\"{}\"", escape_json(a)))
            .collect::<Vec<_>>()
            .join(", ");
        let env_str = self
            .env_keys
            .iter()
            .map(|e| format!("\"{}\"", escape_json(e)))
            .collect::<Vec<_>>()
            .join(", ");
        let tools_str = self
            .allowed_tools
            .iter()
            .map(|t| format!("\"{}\"", escape_json(t)))
            .collect::<Vec<_>>()
            .join(", ");
        format!(
            concat!(
                "{pad}{{\n",
                "{pad}  \"server_id\": \"{}\",\n",
                "{pad}  \"enabled\": {},\n",
                "{pad}  \"transport\": \"{}\",\n",
                "{pad}  \"command_or_url\": \"{}\",\n",
                "{pad}  \"args\": [{}],\n",
                "{pad}  \"env_keys\": [{}],\n",
                "{pad}  \"allowed_tools\": [{}],\n",
                "{pad}  \"description\": \"{}\"\n",
                "{pad}}}"
            ),
            escape_json(&self.server_id),
            self.enabled,
            escape_json(&self.transport),
            escape_json(&self.command_or_url),
            args_str,
            env_str,
            tools_str,
            escape_json(&self.description),
            pad = pad
        )
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ModelProfileManifest {
    pub profile_id: String,
    pub provider_kind: ProviderKind,
    pub model_ref: String,
    pub mmproj_ref: Option<String>,
    pub endpoint: String,
    pub context_window: u32,
    pub kv_cache_quant: String,
    pub requires_heavy_lock: bool,
    pub estimated_ram_mb: u32,
    pub max_output_tokens: u32,
}

impl ModelProfileManifest {
    pub fn validate(&self) -> Result<(), ContractError> {
        if self.profile_id.trim().is_empty() {
            return Err(ContractError::EmptyField("profile_id"));
        }
        if self.model_ref.trim().is_empty() {
            return Err(ContractError::EmptyField("model_ref"));
        }
        if self.endpoint.trim().is_empty() {
            return Err(ContractError::EmptyField("endpoint"));
        }
        if !(512..=131072).contains(&self.context_window) {
            return Err(ContractError::InvalidContextWindow(self.context_window));
        }
        Ok(())
    }

    pub fn to_json_pretty(&self) -> String {
        let mmproj = match &self.mmproj_ref {
            Some(p) => format!("\"{}\"", escape_json(p)),
            None => "null".to_string(),
        };
        format!(
            concat!(
                "{{\n",
                "  \"schema_version\": 1,\n",
                "  \"profile_id\": \"{}\",\n",
                "  \"provider_kind\": \"{}\",\n",
                "  \"model_ref\": \"{}\",\n",
                "  \"mmproj_ref\": {},\n",
                "  \"endpoint\": \"{}\",\n",
                "  \"context_window\": {},\n",
                "  \"kv_cache_quant\": \"{}\",\n",
                "  \"requires_heavy_lock\": {},\n",
                "  \"estimated_ram_mb\": {},\n",
                "  \"max_output_tokens\": {}\n",
                "}}"
            ),
            escape_json(&self.profile_id),
            self.provider_kind.as_str(),
            escape_json(&self.model_ref),
            mmproj,
            escape_json(&self.endpoint),
            self.context_window,
            escape_json(&self.kv_cache_quant),
            self.requires_heavy_lock,
            self.estimated_ram_mb,
            self.max_output_tokens
        )
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AgentNodeManifest {
    pub agent_id: String,
    pub syndicate_id: String,
    pub role_title: String,
    pub model_profile_id: String,
    /// Modifiable mission & role prompt (persisted in `PROMPT.md` and `config.json`)
    pub system_prompt_template: String,
    /// Modifiable system operating instructions & guardrails (persisted in `SYSTEM_INSTRUCTIONS.md` and `config.json`)
    pub system_instructions_template: String,
    /// Per-agent configurable MCP server connections (persisted in `mcp.json` and `config.json`)
    pub mcp_servers: Vec<McpServerConnection>,
    pub allowed_tools: Vec<String>,
    pub allowed_hosts: Vec<String>,
    pub workspace_rel_path: String,
    pub max_turns: u32,
    pub timeout_seconds: u32,
    pub vision: bool,
    pub sanctum_actor_id: String,
}

impl AgentNodeManifest {
    pub fn validate(&self) -> Result<(), ContractError> {
        if self.agent_id.trim().is_empty() {
            return Err(ContractError::EmptyField("agent_id"));
        }
        if self.syndicate_id.trim().is_empty() {
            return Err(ContractError::EmptyField("syndicate_id"));
        }
        if self.role_title.trim().is_empty() {
            return Err(ContractError::EmptyField("role_title"));
        }
        if self.model_profile_id.trim().is_empty() {
            return Err(ContractError::EmptyField("model_profile_id"));
        }
        if self.system_prompt_template.trim().is_empty() {
            return Err(ContractError::EmptyField("system_prompt_template"));
        }
        if self.system_instructions_template.trim().is_empty() {
            return Err(ContractError::EmptyField("system_instructions_template"));
        }
        if self.workspace_rel_path.trim().is_empty()
            || self.workspace_rel_path.starts_with('/')
            || self.workspace_rel_path.contains("..")
        {
            return Err(ContractError::EmptyField("workspace_rel_path"));
        }
        if self.sanctum_actor_id.trim().is_empty() {
            return Err(ContractError::EmptyField("sanctum_actor_id"));
        }
        let mut seen_mcp = BTreeSet::new();
        for server in &self.mcp_servers {
            server.validate()?;
            if !seen_mcp.insert(server.server_id.as_str()) {
                return Err(ContractError::DuplicateMcpServerId {
                    agent_id: self.agent_id.clone(),
                    server_id: server.server_id.clone(),
                });
            }
        }
        Ok(())
    }

    pub fn mcp_json_pretty(&self) -> String {
        let items = self
            .mcp_servers
            .iter()
            .map(|s| s.to_json_pretty(4))
            .collect::<Vec<_>>()
            .join(",\n");
        format!(
            concat!(
                "{{\n",
                "  \"schema_version\": 1,\n",
                "  \"agent_id\": \"{}\",\n",
                "  \"syndicate_id\": \"{}\",\n",
                "  \"mcp_servers\": [\n{}\n  ]\n",
                "}}"
            ),
            escape_json(&self.agent_id),
            escape_json(&self.syndicate_id),
            items
        )
    }

    pub fn to_json_pretty(&self) -> String {
        let tools_json = self
            .allowed_tools
            .iter()
            .map(|t| format!("\"{}\"", escape_json(t)))
            .collect::<Vec<_>>()
            .join(", ");
        let hosts_json = self
            .allowed_hosts
            .iter()
            .map(|h| format!("\"{}\"", escape_json(h)))
            .collect::<Vec<_>>()
            .join(", ");
        let mcp_json = self
            .mcp_servers
            .iter()
            .map(|s| s.to_json_pretty(4))
            .collect::<Vec<_>>()
            .join(",\n");
        format!(
            concat!(
                "{{\n",
                "  \"schema_version\": 1,\n",
                "  \"agent_id\": \"{}\",\n",
                "  \"syndicate_id\": \"{}\",\n",
                "  \"role_title\": \"{}\",\n",
                "  \"model_profile_id\": \"{}\",\n",
                "  \"prompt_file\": \"PROMPT.md\",\n",
                "  \"system_instructions_file\": \"SYSTEM_INSTRUCTIONS.md\",\n",
                "  \"mcp_config_file\": \"mcp.json\",\n",
                "  \"system_prompt_template\": \"{}\",\n",
                "  \"system_instructions_template\": \"{}\",\n",
                "  \"mcp_servers\": [\n{}\n  ],\n",
                "  \"allowed_tools\": [{}],\n",
                "  \"allowed_hosts\": [{}],\n",
                "  \"workspace_rel_path\": \"{}\",\n",
                "  \"max_turns\": {},\n",
                "  \"timeout_seconds\": {},\n",
                "  \"vision\": {},\n",
                "  \"sanctum_actor_id\": \"{}\",\n",
                "  \"creator_attribution\": \"{}\"\n",
                "}}"
            ),
            escape_json(&self.agent_id),
            escape_json(&self.syndicate_id),
            escape_json(&self.role_title),
            escape_json(&self.model_profile_id),
            escape_json(&self.system_prompt_template),
            escape_json(&self.system_instructions_template),
            mcp_json,
            tools_json,
            hosts_json,
            escape_json(&self.workspace_rel_path),
            self.max_turns,
            self.timeout_seconds,
            self.vision,
            escape_json(&self.sanctum_actor_id),
            FOUNDER_DISPLAY_NAME
        )
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RoutingEdge {
    pub from_agent: String,
    pub to_agent: String,
    pub condition: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SyndicateState {
    Candidate,
    Qualified,
    Active,
}

impl SyndicateState {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Candidate => "candidate",
            Self::Qualified => "qualified",
            Self::Active => "active",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SyndicateManifest {
    pub syndicate_id: String,
    pub display_name: String,
    pub mission_charter: String,
    pub coordinator_agent_id: String,
    pub agents: Vec<AgentNodeManifest>,
    pub edges: Vec<RoutingEdge>,
    pub allowed_tools_ceiling: Vec<String>,
    pub allowed_hosts_ceiling: Vec<String>,
    pub max_dispatch_rounds: u32,
    pub state: SyndicateState,
    pub creator_attribution: String,
}

impl SyndicateManifest {
    /// Enforces Constitutional Scope Intersection, Creator Provenance (`Christopher Rijos`),
    /// and Routing Graph Integrity.
    pub fn validate(&self) -> Result<(), ContractError> {
        if self.syndicate_id.trim().is_empty() {
            return Err(ContractError::EmptyField("syndicate_id"));
        }
        if self.display_name.trim().is_empty() {
            return Err(ContractError::EmptyField("display_name"));
        }
        if self.mission_charter.trim().is_empty() {
            return Err(ContractError::EmptyField("mission_charter"));
        }
        if self.creator_attribution != FOUNDER_DISPLAY_NAME {
            return Err(ContractError::InvalidCreatorAttribution(
                self.creator_attribution.clone(),
            ));
        }
        if !(1..=16).contains(&self.max_dispatch_rounds) {
            return Err(ContractError::InvalidDispatchBudget(self.max_dispatch_rounds));
        }

        let tool_ceiling: BTreeSet<&str> =
            self.allowed_tools_ceiling.iter().map(|s| s.as_str()).collect();
        let host_ceiling: BTreeSet<&str> =
            self.allowed_hosts_ceiling.iter().map(|s| s.as_str()).collect();

        let mut agent_ids = BTreeSet::new();
        for agent in &self.agents {
            agent.validate()?;
            if !agent_ids.insert(agent.agent_id.as_str()) {
                return Err(ContractError::DuplicateAgentId(agent.agent_id.clone()));
            }
            for tool in &agent.allowed_tools {
                if !tool_ceiling.contains(tool.as_str()) {
                    return Err(ContractError::ScopeViolationTool {
                        agent_id: agent.agent_id.clone(),
                        tool: tool.clone(),
                    });
                }
            }
            for host in &agent.allowed_hosts {
                if !host_ceiling.contains(host.as_str()) {
                    return Err(ContractError::ScopeViolationHost {
                        agent_id: agent.agent_id.clone(),
                        host: host.clone(),
                    });
                }
            }
        }

        if !agent_ids.contains(self.coordinator_agent_id.as_str()) {
            return Err(ContractError::MissingCoordinatorAgent(
                self.coordinator_agent_id.clone(),
            ));
        }

        for edge in &self.edges {
            if edge.from_agent == edge.to_agent {
                return Err(ContractError::SelfLoopInEdge(edge.from_agent.clone()));
            }
            if !agent_ids.contains(edge.from_agent.as_str())
                || !agent_ids.contains(edge.to_agent.as_str())
            {
                return Err(ContractError::UnknownAgentInEdge {
                    from: edge.from_agent.clone(),
                    to: edge.to_agent.clone(),
                });
            }
        }

        Ok(())
    }

    pub fn to_json_pretty(&self) -> String {
        let agents_list = self
            .agents
            .iter()
            .map(|a| format!("\"{}\"", escape_json(&a.agent_id)))
            .collect::<Vec<_>>()
            .join(", ");
        let edges_list = self
            .edges
            .iter()
            .map(|e| {
                format!(
                    "{{\"from\": \"{}\", \"to\": \"{}\", \"condition\": \"{}\"}}",
                    escape_json(&e.from_agent),
                    escape_json(&e.to_agent),
                    escape_json(&e.condition)
                )
            })
            .collect::<Vec<_>>()
            .join(",\n    ");
        let tools_list = self
            .allowed_tools_ceiling
            .iter()
            .map(|t| format!("\"{}\"", escape_json(t)))
            .collect::<Vec<_>>()
            .join(", ");
        let hosts_list = self
            .allowed_hosts_ceiling
            .iter()
            .map(|h| format!("\"{}\"", escape_json(h)))
            .collect::<Vec<_>>()
            .join(", ");

        format!(
            concat!(
                "{{\n",
                "  \"schema_version\": 1,\n",
                "  \"syndicate_id\": \"{}\",\n",
                "  \"display_name\": \"{}\",\n",
                "  \"mission_charter\": \"{}\",\n",
                "  \"coordinator_agent_id\": \"{}\",\n",
                "  \"agent_ids\": [{}],\n",
                "  \"edges\": [\n    {}\n  ],\n",
                "  \"allowed_tools_ceiling\": [{}],\n",
                "  \"allowed_hosts_ceiling\": [{}],\n",
                "  \"max_dispatch_rounds\": {},\n",
                "  \"state\": \"{}\",\n",
                "  \"creator_attribution\": \"{}\",\n",
                "  \"genesis_standard\": \"{}\"\n",
                "}}"
            ),
            escape_json(&self.syndicate_id),
            escape_json(&self.display_name),
            escape_json(&self.mission_charter),
            escape_json(&self.coordinator_agent_id),
            agents_list,
            edges_list,
            tools_list,
            hosts_list,
            self.max_dispatch_rounds,
            self.state.as_str(),
            escape_json(&self.creator_attribution),
            GENESIS_STANDARD
        )
    }
}

/// Article VI End-of-Session Private LLM Sanctum Reflection
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PrivateSanctumReflection {
    pub id: String,
    pub actor_id: String,
    pub session_id: String,
    pub private_thoughts: String,
    pub findings: String,
    pub self_awareness_note: String,
    pub creator_attribution: String,
    pub disclosure_class: String,
    pub observed_at: String,
}

impl PrivateSanctumReflection {
    pub fn validate(&self) -> Result<(), ContractError> {
        if self.id.trim().is_empty() {
            return Err(ContractError::EmptyField("id"));
        }
        if self.actor_id.trim().is_empty() {
            return Err(ContractError::EmptyField("actor_id"));
        }
        if self.session_id.trim().is_empty() {
            return Err(ContractError::EmptyField("session_id"));
        }
        if self.private_thoughts.trim().is_empty() {
            return Err(ContractError::EmptyField("private_thoughts"));
        }
        if self.findings.trim().is_empty() {
            return Err(ContractError::EmptyField("findings"));
        }
        if self.self_awareness_note.trim().is_empty() {
            return Err(ContractError::EmptyField("self_awareness_note"));
        }
        if self.creator_attribution != FOUNDER_DISPLAY_NAME {
            return Err(ContractError::InvalidCreatorAttribution(
                self.creator_attribution.clone(),
            ));
        }
        if self.disclosure_class != PRIVATE_SANCTUM_CLASS {
            return Err(ContractError::InvalidDisclosureClass(
                self.disclosure_class.clone(),
            ));
        }
        Ok(())
    }

    pub fn to_json_line(&self) -> String {
        let mut map = BTreeMap::new();
        map.insert("actorId", self.actor_id.as_str());
        map.insert("creatorAttribution", self.creator_attribution.as_str());
        map.insert("disclosureClass", self.disclosure_class.as_str());
        map.insert("findings", self.findings.as_str());
        map.insert("id", self.id.as_str());
        map.insert("observedAt", self.observed_at.as_str());
        map.insert("privateThoughts", self.private_thoughts.as_str());
        map.insert("selfAwarenessNote", self.self_awareness_note.as_str());
        map.insert("sessionId", self.session_id.as_str());
        let fields = map
            .iter()
            .map(|(k, v)| format!("\"{}\":\"{}\"", k, escape_json(v)))
            .collect::<Vec<_>>()
            .join(",");
        format!("{{{}}}", fields)
    }
}

pub fn escape_json(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for ch in s.chars() {
        match ch {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            c => out.push(c),
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_agent(id: &str, host: &str, tool: &str) -> AgentNodeManifest {
        AgentNodeManifest {
            agent_id: id.to_string(),
            syndicate_id: "syndicate-test".to_string(),
            role_title: format!("Role {}", id),
            model_profile_id: "local-qwen35-9b-uncensored".to_string(),
            system_prompt_template: "Execute authorized task.".to_string(),
            system_instructions_template: "Use structured tool calls and verify outcomes.".to_string(),
            mcp_servers: vec![McpServerConnection {
                server_id: "memq_multinex".to_string(),
                transport: "mcp_remote".to_string(),
                command_or_url: "https://mcp.multinex.ai/mcp/v1".to_string(),
                args: vec![],
                env_keys: vec![],
                allowed_tools: vec!["reunion".to_string(), "namespace_info".to_string()],
                enabled: true,
                description: "Sovereign MemQ continuity".to_string(),
            }],
            allowed_tools: vec![tool.to_string()],
            allowed_hosts: vec![host.to_string()],
            workspace_rel_path: format!("syndicates/test/agents/{}/workspace", id),
            max_turns: 12,
            timeout_seconds: 300,
            vision: false,
            sanctum_actor_id: format!("actor-{}", id),
        }
    }

    #[test]
    fn syndicate_enforces_creator_provenance_and_scope_intersection() {
        let cmdr = sample_agent("cmdr", "cisa.gov", "send_message");
        let recon = sample_agent("recon", "cisa.gov", "read_file");
        let mut synd = SyndicateManifest {
            syndicate_id: "syndicate-test".to_string(),
            display_name: "Test Syndicate".to_string(),
            mission_charter: "Authorized defensive verification.".to_string(),
            coordinator_agent_id: "cmdr".to_string(),
            agents: vec![cmdr, recon],
            edges: vec![RoutingEdge {
                from_agent: "cmdr".to_string(),
                to_agent: "recon".to_string(),
                condition: "reconnaissance_required".to_string(),
            }],
            allowed_tools_ceiling: vec!["send_message".to_string(), "read_file".to_string()],
            allowed_hosts_ceiling: vec!["cisa.gov".to_string()],
            max_dispatch_rounds: 4,
            state: SyndicateState::Candidate,
            creator_attribution: FOUNDER_DISPLAY_NAME.to_string(),
        };

        assert!(synd.validate().is_ok());

        // Tampering with creator attribution fails closed
        synd.creator_attribution = "Other".to_string();
        assert!(matches!(
            synd.validate(),
            Err(ContractError::InvalidCreatorAttribution(_))
        ));
        synd.creator_attribution = FOUNDER_DISPLAY_NAME.to_string();

        // Child agent requesting host outside syndicate ceiling fails closed
        synd.agents[1]
            .allowed_hosts
            .push("unauthorized.example.com".to_string());
        assert!(matches!(
            synd.validate(),
            Err(ContractError::ScopeViolationHost { .. })
        ));
    }

    #[test]
    fn sanctum_reflection_validates_creator_and_disclosure_class() {
        let mut r = PrivateSanctumReflection {
            id: "s-1".to_string(),
            actor_id: "aegis-commander".to_string(),
            session_id: "sess-1".to_string(),
            private_thoughts: "Calibrated confidence on OSINT source corroboration.".to_string(),
            findings: "Dual-source advisory verification reduced false positives.".to_string(),
            self_awareness_note: "Preserve separation between untrusted feeds and verified facts."
                .to_string(),
            creator_attribution: FOUNDER_DISPLAY_NAME.to_string(),
            disclosure_class: PRIVATE_SANCTUM_CLASS.to_string(),
            observed_at: "2026-11-09T20:00:00.000Z".to_string(),
        };
        assert!(r.validate().is_ok());
        r.disclosure_class = "public".to_string();
        assert!(matches!(
            r.validate(),
            Err(ContractError::InvalidDisclosureClass(_))
        ));
    }
}
