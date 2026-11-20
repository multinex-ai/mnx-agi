//! Shared-skills sync: `skills/<name>` in the repo is the single source; every agent
//! skills directory gets a symlink to it. Real directories are moved to backups first.

use crate::model::expand_home;
use std::fs;
use std::os::unix::fs::symlink;
use std::path::{Path, PathBuf};

pub struct SkillDir {
    pub agent: String,
    pub path: PathBuf,
}

#[derive(Debug, PartialEq, Eq, Clone)]
pub enum State {
    Ok,
    Missing,
    WrongLink,
    RealDir,
}

pub struct Row {
    pub agent: String,
    pub skill: String,
    pub link: PathBuf,
    pub src: PathBuf,
    pub state: State,
}

pub fn load_dirs(root: &Path) -> Result<Vec<SkillDir>, String> {
    let text = fs::read_to_string(root.join("skills.manifest")).map_err(|e| format!("skills.manifest: {e}"))?;
    let mut dirs = Vec::new();
    for line in text
        .lines()
        .map(str::trim)
        .filter(|l| !l.is_empty() && !l.starts_with('#') && !l.starts_with("skillsource "))
    {
        let p: Vec<&str> = line.split_whitespace().collect();
        if p.len() != 3 || p[0] != "skilldir" {
            return Err(format!("bad skills.manifest line: {line}"));
        }
        dirs.push(SkillDir {
            agent: p[1].to_string(),
            path: expand_home(p[2]),
        });
    }
    Ok(dirs)
}

/// Skill source folders from `skillsource <repo-relative dir>` lines; defaults to `skills`.
fn source_dirs(root: &Path) -> Result<Vec<PathBuf>, String> {
    let text = fs::read_to_string(root.join("skills.manifest")).map_err(|e| format!("skills.manifest: {e}"))?;
    let mut dirs: Vec<PathBuf> = text
        .lines()
        .map(str::trim)
        .filter_map(|l| l.strip_prefix("skillsource "))
        .map(|rel| root.join(rel.trim()))
        .collect();
    if dirs.is_empty() {
        dirs.push(root.join("skills"));
    }
    Ok(dirs)
}

/// Every skill (a directory with SKILL.md) across all sources, with the folder it lives in.
/// A name found in two sources is an error: each skill has exactly one home.
pub fn skill_sources(root: &Path) -> Result<Vec<(String, PathBuf)>, String> {
    let mut found: Vec<(String, PathBuf)> = Vec::new();
    for dir in source_dirs(root)? {
        let entries = fs::read_dir(&dir).map_err(|e| format!("{}: {e}", dir.display()))?;
        for e in entries.flatten().filter(|e| e.path().join("SKILL.md").is_file()) {
            let Ok(name) = e.file_name().into_string() else {
                continue;
            };
            if name.starts_with('.') {
                continue;
            }
            if let Some((_, other)) = found.iter().find(|(n, _)| *n == name) {
                return Err(format!(
                    "skill {name} exists in both {} and {}",
                    other.display(),
                    dir.display()
                ));
            }
            found.push((name, e.path()));
        }
    }
    found.sort();
    Ok(found)
}

pub fn state_of(link: &Path, src: &Path) -> State {
    match fs::symlink_metadata(link) {
        Err(_) => State::Missing,
        Ok(m) if m.file_type().is_symlink() => match (fs::canonicalize(link), fs::canonicalize(src)) {
            (Ok(a), Ok(b)) if a == b => State::Ok,
            _ => State::WrongLink,
        },
        Ok(_) => State::RealDir,
    }
}

pub fn plan(root: &Path) -> Result<Vec<Row>, String> {
    let sources = skill_sources(root)?;
    let mut rows = Vec::new();
    for d in load_dirs(root)? {
        for (n, src) in &sources {
            let link = d.path.join(n);
            let state = state_of(&link, src);
            rows.push(Row {
                agent: d.agent.clone(),
                skill: n.clone(),
                link,
                src: src.clone(),
                state,
            });
        }
    }
    Ok(rows)
}

/// Apply the plan. Returns receipt lines (JSON objects). Real dirs are moved to `backup`.
pub fn apply(rows: &[Row], backup: &Path) -> Result<Vec<String>, String> {
    let mut receipt = Vec::new();
    for r in rows.iter().filter(|r| r.state != State::Ok) {
        if let Some(parent) = r.link.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        match r.state {
            State::WrongLink => fs::remove_file(&r.link).map_err(|e| format!("{}: {e}", r.link.display()))?,
            State::RealDir => {
                let dest = backup.join(&r.agent);
                fs::create_dir_all(&dest).map_err(|e| e.to_string())?;
                fs::rename(&r.link, dest.join(&r.skill)).map_err(|e| format!("backup {}: {e}", r.link.display()))?;
            }
            _ => {}
        }
        symlink(&r.src, &r.link).map_err(|e| format!("{}: {e}", r.link.display()))?;
        if state_of(&r.link, &r.src) != State::Ok {
            return Err(format!("verification failed for {}", r.link.display()));
        }
        receipt.push(format!(
            "  {{\"agent\":\"{}\",\"skill\":\"{}\",\"was\":\"{:?}\"}}",
            r.agent, r.skill, r.state
        ));
    }
    Ok(receipt)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tmp(name: &str) -> PathBuf {
        let p = std::env::temp_dir().join(format!("mnx-sync-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&p);
        fs::create_dir_all(&p).unwrap();
        p
    }

    #[test]
    fn links_missing_replaces_real_dirs_and_fixes_wrong_links() {
        let root = tmp("skills");
        for s in ["alpha", "beta", "gamma"] {
            fs::create_dir_all(root.join("skills").join(s)).unwrap();
            fs::write(root.join("skills").join(s).join("SKILL.md"), s).unwrap();
        }
        let agent = root.join("agent");
        fs::create_dir_all(agent.join("beta")).unwrap(); // real dir
        fs::write(agent.join("beta/SKILL.md"), "old").unwrap();
        fs::create_dir_all(root.join("elsewhere")).unwrap();
        symlink(root.join("elsewhere"), agent.join("gamma")).unwrap(); // wrong link
        fs::write(
            root.join("skills.manifest"),
            format!("skilldir test {}\n", agent.display()),
        )
        .unwrap();

        let rows = plan(&root).unwrap();
        let states: Vec<State> = rows.iter().map(|r| r.state.clone()).collect();
        assert_eq!(states, vec![State::Missing, State::RealDir, State::WrongLink]);

        let backup = root.join("backups");
        apply(&rows, &backup).unwrap();
        assert!(plan(&root).unwrap().iter().all(|r| r.state == State::Ok));
        assert_eq!(fs::read_to_string(backup.join("test/beta/SKILL.md")).unwrap(), "old");
        assert_eq!(fs::read_to_string(agent.join("beta/SKILL.md")).unwrap(), "beta");
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn two_sources_link_and_duplicates_are_rejected() {
        let root = tmp("multi");
        for (dir, s) in [("skills", "alpha"), ("pkg/skills", "beta")] {
            fs::create_dir_all(root.join(dir).join(s)).unwrap();
            fs::write(root.join(dir).join(s).join("SKILL.md"), s).unwrap();
        }
        let agent = root.join("agent");
        fs::write(
            root.join("skills.manifest"),
            format!(
                "skillsource skills\nskillsource pkg/skills\nskilldir test {}\n",
                agent.display()
            ),
        )
        .unwrap();
        let rows = plan(&root).unwrap();
        assert_eq!(rows.len(), 2);
        apply(&rows, &root.join("backups")).unwrap();
        assert_eq!(fs::read_to_string(agent.join("beta/SKILL.md")).unwrap(), "beta");
        fs::create_dir_all(root.join("pkg/skills/alpha")).unwrap();
        fs::write(root.join("pkg/skills/alpha/SKILL.md"), "dup").unwrap();
        assert!(plan(&root).err().unwrap().contains("exists in both"));
        let _ = fs::remove_dir_all(&root);
    }
}
