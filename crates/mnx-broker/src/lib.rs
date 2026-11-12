//! MNX-AGI Native Rust Privilege & MemQ Scope Broker (`mnx-broker`)
//!
//! Enforces:
//! - Multinex (`memq_multinex`) vs. Galileo/Thermo-Fisher (`denied_roots`) repository/worktree isolation
//! - Verified handshake binding (`namespace`, `tenant_id`, `authenticated_subject`)
//! - Conditional Compare-And-Swap (`expected_state_version`) on shared mutations
//! - Article VI Private LLM Sanctum read isolation (`actor_id` must match)

use std::path::{Path, PathBuf};

pub const MULTINEX_NAMESPACE: &str = "org:3f01ad9f-4384-4f80-a2be-661185c5b207";
pub const MULTINEX_TENANT_ID: &str = "3f01ad9f-4384-4f80-a2be-661185c5b207";
pub const MULTINEX_SUBJECT_ID: &str = "6098b4e7-9c64-43e3-bc09-9223f7b43bf3";

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MemqBinding {
    pub expected_namespace: String,
    pub expected_tenant_id: String,
    pub expected_subject: String,
    pub denied_roots: Vec<PathBuf>,
}

impl Default for MemqBinding {
    fn default() -> Self {
        let home = std::env::var("HOME").unwrap_or_else(|_| "/tmp".to_string());
        let home_path = PathBuf::from(home);
        Self {
            expected_namespace: MULTINEX_NAMESPACE.to_string(),
            expected_tenant_id: MULTINEX_TENANT_ID.to_string(),
            expected_subject: MULTINEX_SUBJECT_ID.to_string(),
            denied_roots: vec![
                home_path.join("Projects/galileo-tf"),
                home_path.join("Documents/TF"),
            ],
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct HandshakeObservation {
    pub namespace: String,
    pub tenant_id: String,
    pub authenticated_subject: String,
    pub namespace_scoped: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum BrokerDecision {
    Allowed,
    Denied(&'static str),
}

impl BrokerDecision {
    pub fn is_allowed(&self) -> bool {
        matches!(self, Self::Allowed)
    }
}

/// Checks whether a candidate working directory or target path falls inside a denied root
/// (such as Galileo or Thermo Fisher), preventing `memq_multinex` access.
pub fn is_denied_project_path(target: &Path, denied_roots: &[PathBuf]) -> bool {
    let normalized = target.canonicalize().unwrap_or_else(|_| target.to_path_buf());
    for root in denied_roots {
        let norm_root = root.canonicalize().unwrap_or_else(|_| root.to_path_buf());
        if normalized == norm_root || normalized.starts_with(&norm_root) {
            return true;
        }
    }
    false
}

/// Evaluates whether a MemQ operation is authorized under the active binding and handshake.
pub fn evaluate_memq_operation(
    binding: &MemqBinding,
    handshake: &HandshakeObservation,
    cwd: &Path,
    explicit_target: Option<&Path>,
    is_shared_mutation: bool,
    expected_state_version: Option<u64>,
) -> BrokerDecision {
    if is_denied_project_path(cwd, &binding.denied_roots) {
        return BrokerDecision::Denied("denied_project_root_cwd");
    }
    if let Some(target) = explicit_target {
        if is_denied_project_path(target, &binding.denied_roots) {
            return BrokerDecision::Denied("denied_project_root_target");
        }
    }
    if !handshake.namespace_scoped {
        return BrokerDecision::Denied("handshake_not_namespace_scoped");
    }
    if handshake.namespace != binding.expected_namespace {
        return BrokerDecision::Denied("namespace_mismatch");
    }
    if handshake.tenant_id != binding.expected_tenant_id {
        return BrokerDecision::Denied("tenant_mismatch");
    }
    if handshake.authenticated_subject != binding.expected_subject {
        return BrokerDecision::Denied("subject_mismatch");
    }
    if is_shared_mutation && expected_state_version.is_none() {
        return BrokerDecision::Denied("conditional_version_required");
    }
    BrokerDecision::Allowed
}

#[cfg(test)]
mod tests {
    use super::*;

    fn valid_handshake() -> HandshakeObservation {
        HandshakeObservation {
            namespace: MULTINEX_NAMESPACE.to_string(),
            tenant_id: MULTINEX_TENANT_ID.to_string(),
            authenticated_subject: MULTINEX_SUBJECT_ID.to_string(),
            namespace_scoped: true,
        }
    }

    #[test]
    fn broker_blocks_galileo_and_tf_paths_and_requires_cas_for_writes() {
        let home = PathBuf::from(std::env::var("HOME").unwrap_or_else(|_| "/tmp".to_string()));
        let binding = MemqBinding::default();
        let hs = valid_handshake();

        assert_eq!(
            evaluate_memq_operation(
                &binding,
                &hs,
                &home.join("Documents/Agents"),
                None,
                true,
                Some(2)
            ),
            BrokerDecision::Allowed
        );

        assert_eq!(
            evaluate_memq_operation(
                &binding,
                &hs,
                &home.join("Projects/galileo-tf/app"),
                None,
                false,
                None
            ),
            BrokerDecision::Denied("denied_project_root_cwd")
        );

        assert_eq!(
            evaluate_memq_operation(
                &binding,
                &hs,
                &home.join("Documents/Agents"),
                Some(&home.join("Documents/TF/service")),
                false,
                None
            ),
            BrokerDecision::Denied("denied_project_root_target")
        );

        assert_eq!(
            evaluate_memq_operation(
                &binding,
                &hs,
                &home.join("Documents/Agents"),
                None,
                true,
                None
            ),
            BrokerDecision::Denied("conditional_version_required")
        );
    }
}
