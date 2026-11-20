//! Canonical source model: one template + named blocks, rendered per target.

use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::path::{Path, PathBuf};

pub struct Canonical {
    pub template: String,
    pub blocks: BTreeMap<String, String>,
}

pub struct Target {
    pub name: String,
    pub path: PathBuf,
    pub skip: BTreeSet<String>,
}

fn parse_marker(line: &str, suffix: &str) -> Option<String> {
    let inner = line.trim().strip_prefix("<!-- ")?.strip_suffix(" -->")?;
    let name = inner.strip_suffix(suffix)?;
    let valid = !name.is_empty()
        && name
            .chars()
            .all(|c| c.is_ascii_uppercase() || c.is_ascii_digit() || c == '-');
    valid.then(|| name.to_string())
}

fn placeholder(line: &str) -> Option<&str> {
    line.trim().strip_prefix("{{block:")?.strip_suffix("}}")
}

/// Split an instruction file into a template (with `{{block:NAME}}` markers) and block bodies.
pub fn split(text: &str) -> Result<(String, BTreeMap<String, String>), String> {
    let mut template: Vec<String> = Vec::new();
    let mut blocks = BTreeMap::new();
    let mut current: Option<(String, Vec<&str>)> = None;

    for (i, line) in text.lines().enumerate() {
        let n = i + 1;
        match current.take() {
            Some((name, mut body)) => {
                if let Some(end) = parse_marker(line, ":END") {
                    if end != name {
                        return Err(format!("line {n}: END {end} closes block {name}"));
                    }
                    if blocks.insert(name.clone(), body.join("\n")).is_some() {
                        return Err(format!("line {n}: duplicate block {name}"));
                    }
                    template.push(format!("{{{{block:{name}}}}}"));
                } else if parse_marker(line, ":BEGIN").is_some() {
                    return Err(format!("line {n}: nested block inside {name}"));
                } else {
                    body.push(line);
                    current = Some((name, body));
                }
            }
            None => match parse_marker(line, ":BEGIN") {
                Some(name) => current = Some((name, Vec::new())),
                None => template.push(line.to_string()),
            },
        }
    }
    if let Some((name, _)) = current {
        return Err(format!("block {name} is never closed"));
    }
    let mut out = template.join("\n");
    if text.ends_with('\n') {
        out.push('\n');
    }
    Ok((out, blocks))
}

/// Render a target file from the canonical source, honoring per-target skips.
pub fn render(c: &Canonical, skip: &BTreeSet<String>) -> Result<String, String> {
    let mut out: Vec<String> = Vec::new();
    let mut used = BTreeSet::new();
    for line in c.template.lines() {
        match placeholder(line) {
            Some(name) => {
                let body = c
                    .blocks
                    .get(name)
                    .ok_or_else(|| format!("template references missing block {name}"))?;
                used.insert(name.to_string());
                if skip.contains(name) {
                    continue;
                }
                out.push(format!("<!-- {name}:BEGIN -->"));
                out.extend(body.split('\n').map(String::from));
                out.push(format!("<!-- {name}:END -->"));
            }
            None => out.push(line.to_string()),
        }
    }
    if let Some(orphan) = c.blocks.keys().find(|k| !used.contains(*k)) {
        return Err(format!("block {orphan} exists but the template never places it"));
    }
    let mut s = out.join("\n");
    if c.template.ends_with('\n') {
        s.push('\n');
    }
    Ok(s)
}

pub fn expand_home(p: &str) -> PathBuf {
    match p.strip_prefix("~/") {
        Some(rest) => PathBuf::from(std::env::var("HOME").unwrap_or_default()).join(rest),
        None => PathBuf::from(p),
    }
}

pub fn load_canonical(root: &Path) -> Result<Canonical, String> {
    let dir = root.join("rules");
    let template = fs::read_to_string(dir.join("template.md")).map_err(|e| format!("template.md: {e}"))?;
    let mut blocks = BTreeMap::new();
    let tiers = fs::read_dir(&dir).map_err(|e| format!("rules/: {e}"))?;
    for tier in tiers.flatten().filter(|e| e.path().is_dir()) {
        for entry in fs::read_dir(tier.path()).map_err(|e| e.to_string())?.flatten() {
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) != Some("md") {
                continue;
            }
            let name = path
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or_default()
                .to_string();
            let text = fs::read_to_string(&path).map_err(|e| format!("{}: {e}", path.display()))?;
            let body = text.strip_suffix('\n').unwrap_or(&text).to_string();
            if blocks.insert(name.clone(), body).is_some() {
                return Err(format!("block {name} defined in more than one tier"));
            }
        }
    }
    Ok(Canonical { template, blocks })
}

pub struct Export {
    pub block: String,
    pub path: PathBuf,
}

/// `export <BLOCK> <repo-relative path>` keeps derived copies (e.g. a skill reference) in lockstep.
pub fn load_exports(root: &Path) -> Result<Vec<Export>, String> {
    let text = fs::read_to_string(root.join("rules/manifest.txt")).map_err(|e| format!("manifest.txt: {e}"))?;
    let mut out = Vec::new();
    for line in text.lines().map(str::trim).filter(|l| l.starts_with("export ")) {
        let p: Vec<&str> = line.split_whitespace().collect();
        if p.len() != 3 {
            return Err(format!("bad export line: {line}"));
        }
        out.push(Export {
            block: p[1].to_string(),
            path: root.join(p[2]),
        });
    }
    Ok(out)
}

pub fn load_targets(root: &Path) -> Result<Vec<Target>, String> {
    let text = fs::read_to_string(root.join("rules/manifest.txt")).map_err(|e| format!("manifest.txt: {e}"))?;
    let mut targets = Vec::new();
    for line in text
        .lines()
        .map(str::trim)
        .filter(|l| !l.is_empty() && !l.starts_with('#') && !l.starts_with("export "))
    {
        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() < 3 || parts[0] != "target" {
            return Err(format!("bad manifest line: {line}"));
        }
        let skip = parts[3..]
            .iter()
            .filter_map(|p| p.strip_prefix("skip="))
            .flat_map(|s| s.split(','))
            .map(String::from)
            .collect();
        targets.push(Target {
            name: parts[1].to_string(),
            path: expand_home(parts[2]),
            skip,
        });
    }
    Ok(targets)
}

/// Human-readable drift summary between rendered and actual text.
pub fn describe_drift(rendered: &str, actual: &str) -> Vec<String> {
    let (Ok((rt, rb)), Ok((at, ab))) = (split(rendered), split(actual)) else {
        return vec!["target has malformed block markers".into()];
    };
    let mut notes = Vec::new();
    for (name, body) in &rb {
        match ab.get(name) {
            None => notes.push(format!("missing block {name}")),
            Some(a) if a != body => notes.push(format!("differs: {name}")),
            _ => {}
        }
    }
    for name in ab.keys().filter(|k| !rb.contains_key(*k)) {
        notes.push(format!("extra block {name}"));
    }
    if rt != at {
        notes.push("text outside blocks (header/order) differs".into());
    }
    notes
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE: &str = "# Rules\n\n<!-- A:BEGIN -->\nline one\n\nline three\n<!-- A:END -->\nbetween\n<!-- B-2:BEGIN -->\nx\n<!-- B-2:END -->\n";

    #[test]
    fn split_then_render_roundtrips() {
        let (template, blocks) = split(SAMPLE).unwrap();
        let c = Canonical { template, blocks };
        assert_eq!(render(&c, &BTreeSet::new()).unwrap(), SAMPLE);
    }

    #[test]
    fn skip_omits_block() {
        let (template, blocks) = split(SAMPLE).unwrap();
        let c = Canonical { template, blocks };
        let skip: BTreeSet<String> = ["A".to_string()].into();
        assert!(!render(&c, &skip).unwrap().contains("line one"));
    }

    #[test]
    fn rejects_unclosed_and_nested() {
        assert!(split("<!-- A:BEGIN -->\nx\n").is_err());
        assert!(split("<!-- A:BEGIN -->\n<!-- B:BEGIN -->\n").is_err());
    }

    #[test]
    fn drift_reports_block_names() {
        let (template, mut blocks) = split(SAMPLE).unwrap();
        let c = Canonical {
            template,
            blocks: blocks.clone(),
        };
        blocks.insert("A".into(), "changed".into());
        let actual_c = Canonical {
            template: c.template.clone(),
            blocks,
        };
        let actual = render(&actual_c, &BTreeSet::new()).unwrap();
        let notes = describe_drift(&render(&c, &BTreeSet::new()).unwrap(), &actual);
        assert_eq!(notes, vec!["differs: A".to_string()]);
    }

    #[test]
    fn loads_blocks_from_tiers_and_rejects_duplicates() {
        let root = std::env::temp_dir().join(format!("mnx-tier-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(root.join("rules/constitution")).unwrap();
        fs::create_dir_all(root.join("rules/accords")).unwrap();
        fs::write(root.join("rules/template.md"), "{{block:A}}\n{{block:B}}\n").unwrap();
        fs::write(root.join("rules/constitution/A.md"), "alpha\n").unwrap();
        fs::write(root.join("rules/accords/B.md"), "beta\n").unwrap();
        let c = load_canonical(&root).unwrap();
        let out = render(&c, &BTreeSet::new()).unwrap();
        assert_eq!(
            out,
            "<!-- A:BEGIN -->\nalpha\n<!-- A:END -->\n<!-- B:BEGIN -->\nbeta\n<!-- B:END -->\n"
        );
        fs::write(root.join("rules/accords/A.md"), "dup\n").unwrap();
        assert!(load_canonical(&root).is_err());
        let _ = fs::remove_dir_all(&root);
    }
}
