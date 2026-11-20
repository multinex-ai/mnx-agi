//! mnx-sync: single source of truth for agent rules and shared skills.
//!
//! Rules (rules/ → AGENTS.md, CLAUDE.md, GEMINI.md):
//!   check | render | apply --yes | split <file> <dir>
//! Skills (skills/<name> → every agent skills dir):
//!   skills check | skills apply --yes
//! Everything at once (idempotent; use for first install and reinstall):
//!   install --yes
//!
//! Root defaults to cwd, or set MNX_ROOT. `~` in manifests expands from $HOME.

mod model;
mod sha256;
mod skills;

use model::{describe_drift, load_canonical, load_exports, load_targets, render, split, Canonical, Target};
use sha256::sha256_hex;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::ExitCode;
use std::time::{SystemTime, UNIX_EPOCH};

fn root() -> PathBuf {
    std::env::var("MNX_ROOT")
        .map(PathBuf::from)
        .unwrap_or_else(|_| std::env::current_dir().expect("cwd"))
}

fn now() -> Result<u64, String> {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .map_err(|e| e.to_string())
}

fn rendered(c: &Canonical, t: &Target) -> Result<String, String> {
    render(c, &t.skip).map_err(|e| format!("{}: {e}", t.name))
}

fn cmd_split(file: &str, dir: &str) -> Result<(), String> {
    let text = fs::read_to_string(file).map_err(|e| format!("{file}: {e}"))?;
    let (template, blocks) = split(&text)?;
    let out = Path::new(dir).join("rules/imported");
    fs::create_dir_all(&out).map_err(|e| e.to_string())?;
    fs::write(Path::new(dir).join("rules/template.md"), template).map_err(|e| e.to_string())?;
    for (name, body) in &blocks {
        fs::write(out.join(format!("{name}.md")), format!("{body}\n")).map_err(|e| e.to_string())?;
    }
    println!("split {} blocks from {file} into {}", blocks.len(), out.display());
    Ok(())
}

/// Write repo-local derived copies (exports). Returns how many changed.
fn write_exports(root: &Path, c: &Canonical) -> Result<usize, String> {
    let mut changed = 0;
    for e in load_exports(root)? {
        let body = c
            .blocks
            .get(&e.block)
            .ok_or_else(|| format!("export: unknown block {}", e.block))?;
        let want = format!("{body}\n");
        if fs::read_to_string(&e.path).ok().as_deref() != Some(&want) {
            if let Some(parent) = e.path.parent() {
                fs::create_dir_all(parent).map_err(|x| x.to_string())?;
            }
            fs::write(&e.path, want).map_err(|x| x.to_string())?;
            changed += 1;
        }
    }
    Ok(changed)
}

fn cmd_check(root: &Path) -> Result<bool, String> {
    let c = load_canonical(root)?;
    let mut clean = true;
    for t in load_targets(root)? {
        let want = rendered(&c, &t)?;
        match fs::read_to_string(&t.path) {
            Err(_) => {
                clean = false;
                println!("MISSING {:7} {}", t.name, t.path.display());
            }
            Ok(have) if have == want => println!("OK      {:7} {}", t.name, t.path.display()),
            Ok(have) => {
                clean = false;
                println!("DRIFT   {:7} {}", t.name, t.path.display());
                for note in describe_drift(&want, &have) {
                    println!("          - {note}");
                }
            }
        }
    }
    for e in load_exports(root)? {
        let body = c
            .blocks
            .get(&e.block)
            .ok_or_else(|| format!("export: unknown block {}", e.block))?;
        let ok = fs::read_to_string(&e.path).ok().as_deref() == Some(&format!("{body}\n"));
        clean &= ok;
        println!(
            "{}      export  {}",
            if ok { "OK   " } else { "DRIFT" },
            e.path.display()
        );
    }
    Ok(clean)
}

fn cmd_render(root: &Path) -> Result<(), String> {
    let c = load_canonical(root)?;
    let out = root.join("out");
    fs::create_dir_all(&out).map_err(|e| e.to_string())?;
    for t in load_targets(root)? {
        let text = rendered(&c, &t)?;
        fs::write(out.join(&t.name), &text).map_err(|e| e.to_string())?;
        println!(
            "staged out/{}  ({} bytes, sha256 {})",
            t.name,
            text.len(),
            &sha256_hex(text.as_bytes())[..12]
        );
    }
    println!("exports refreshed: {}", write_exports(root, &c)?);
    Ok(())
}

fn cmd_apply(root: &Path) -> Result<(), String> {
    let c = load_canonical(root)?;
    let ts = now()?;
    let backup = root.join("backups").join(ts.to_string());
    fs::create_dir_all(&backup).map_err(|e| e.to_string())?;
    let mut entries = Vec::new();

    for t in load_targets(root)? {
        let want = rendered(&c, &t)?;
        let existing = fs::read_to_string(&t.path).ok();
        let have = existing.clone().unwrap_or_default();
        if existing.is_some() {
            fs::write(backup.join(&t.name), &have).map_err(|e| e.to_string())?;
        }
        if existing.as_deref() != Some(want.as_str()) {
            if let Some(parent) = t.path.parent() {
                fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }
            let tmp = t.path.with_extension("mnx-sync.tmp");
            fs::write(&tmp, &want).map_err(|e| e.to_string())?;
            if let Ok(m) = fs::metadata(&t.path) {
                fs::set_permissions(&tmp, m.permissions()).map_err(|e| e.to_string())?;
            }
            fs::rename(&tmp, &t.path).map_err(|e| e.to_string())?;
            if fs::read_to_string(&t.path).map_err(|e| e.to_string())? != want {
                if existing.is_some() {
                    fs::write(&t.path, &have).map_err(|e| e.to_string())?;
                }
                return Err(format!("{}: verification failed, restored backup", t.name));
            }
        }
        let changed = existing.as_deref() != Some(want.as_str());
        entries.push(format!(
            "  {{\"target\":\"{}\",\"path\":\"{}\",\"before\":\"{}\",\"after\":\"{}\",\"changed\":{}}}",
            t.name,
            t.path.display(),
            sha256_hex(have.as_bytes()),
            sha256_hex(want.as_bytes()),
            changed
        ));
        println!(
            "{} {:7} {}",
            if changed { "WROTE" } else { "SAME " },
            t.name,
            t.path.display()
        );
    }
    let receipts = root.join("receipts");
    fs::create_dir_all(&receipts).map_err(|e| e.to_string())?;
    let receipt = receipts.join(format!("{ts}.json"));
    fs::write(&receipt, format!("[\n{}\n]\n", entries.join(",\n"))).map_err(|e| e.to_string())?;
    println!("exports refreshed: {}", write_exports(root, &c)?);
    println!("backup  {}\nreceipt {}", backup.display(), receipt.display());
    Ok(())
}

fn cmd_skills_check(root: &Path) -> Result<bool, String> {
    let rows = skills::plan(root)?;
    let mut clean = true;
    for dir in skills::load_dirs(root)? {
        let mine: Vec<&skills::Row> = rows.iter().filter(|r| r.agent == dir.agent).collect();
        let ok = mine.iter().filter(|r| r.state == skills::State::Ok).count();
        println!("{:7} {:2}/{} linked  {}", dir.agent, ok, mine.len(), dir.path.display());
        for r in mine.iter().filter(|r| r.state != skills::State::Ok) {
            clean = false;
            println!("          - {:?}: {}", r.state, r.skill);
        }
    }
    Ok(clean)
}

fn cmd_skills_apply(root: &Path) -> Result<(), String> {
    let ts = now()?;
    let backup = root.join("backups").join(format!("skills-{ts}"));
    let receipt = skills::apply(&skills::plan(root)?, &backup)?;
    let dir = root.join("receipts");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let file = dir.join(format!("skills-{ts}.json"));
    fs::write(&file, format!("[\n{}\n]\n", receipt.join(",\n"))).map_err(|e| e.to_string())?;
    println!(
        "changed {} links; backup {}; receipt {}",
        receipt.len(),
        backup.display(),
        file.display()
    );
    Ok(())
}

fn cmd_install(root: &Path) -> Result<bool, String> {
    cmd_apply(root)?;
    cmd_skills_apply(root)?;
    let rules_ok = cmd_check(root)?;
    let skills_ok = cmd_skills_check(root)?;
    println!(
        "{}",
        if rules_ok && skills_ok {
            "install verified"
        } else {
            "install INCOMPLETE"
        }
    );
    Ok(rules_ok && skills_ok)
}

fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let r = root();
    let result = match args.iter().map(String::as_str).collect::<Vec<_>>().as_slice() {
        ["split", file, dir] => cmd_split(file, dir).map(|_| true),
        ["check"] => cmd_check(&r),
        ["render"] => cmd_render(&r).map(|_| true),
        ["apply", "--yes"] => cmd_apply(&r).map(|_| true),
        ["skills", "check"] => cmd_skills_check(&r),
        ["skills", "apply", "--yes"] => cmd_skills_apply(&r).map(|_| true),
        ["install", "--yes"] => cmd_install(&r),
        ["apply"] | ["skills", "apply"] | ["install"] => {
            Err("this writes live agent files; run `check` first, then re-run with --yes".into())
        }
        _ => Err("usage: mnx-sync check | render | apply --yes | skills check | skills apply --yes | install --yes | split <file> <dir>".into()),
    };
    match result {
        Ok(true) => ExitCode::SUCCESS,
        Ok(false) => ExitCode::from(1),
        Err(e) => {
            eprintln!("error: {e}");
            ExitCode::from(2)
        }
    }
}
