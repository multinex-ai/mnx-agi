//! Drives the real binary against a copy of the example rules tree.

use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Output};
use std::sync::atomic::{AtomicUsize, Ordering};

static COUNTER: AtomicUsize = AtomicUsize::new(0);

fn copy_dir(from: &Path, to: &Path) {
    fs::create_dir_all(to).unwrap();
    for entry in fs::read_dir(from).unwrap().flatten() {
        let target = to.join(entry.file_name());
        if entry.path().is_dir() {
            copy_dir(&entry.path(), &target);
        } else {
            fs::copy(entry.path(), target).unwrap();
        }
    }
}

/// A fresh copy of the example tree in its own temp directory.
fn workspace() -> PathBuf {
    let n = COUNTER.fetch_add(1, Ordering::SeqCst);
    let dir = std::env::temp_dir().join(format!("mnx-sync-test-{}-{n}", std::process::id()));
    let _ = fs::remove_dir_all(&dir);
    copy_dir(&Path::new(env!("CARGO_MANIFEST_DIR")).join("example"), &dir);
    dir
}

fn run(dir: &Path, args: &[&str]) -> Output {
    Command::new(env!("CARGO_BIN_EXE_mnx-sync"))
        .args(args)
        .current_dir(dir)
        .env("MNX_ROOT", dir)
        .output()
        .unwrap()
}

fn stdout(o: &Output) -> String {
    String::from_utf8_lossy(&o.stdout).into_owned()
}

fn stderr(o: &Output) -> String {
    String::from_utf8_lossy(&o.stderr).into_owned()
}

#[test]
fn check_fails_before_apply_and_passes_after() {
    let dir = workspace();
    let before = run(&dir, &["check"]);
    assert_eq!(before.status.code(), Some(1));
    assert!(stdout(&before).contains("MISSING"));

    assert_eq!(run(&dir, &["apply", "--yes"]).status.code(), Some(0));

    let after = run(&dir, &["check"]);
    assert_eq!(after.status.code(), Some(0), "{}", stdout(&after));
    let codex = fs::read_to_string(dir.join("live/AGENTS.md")).unwrap();
    assert!(codex.contains("<!-- CORE:BEGIN -->") && codex.contains("Owner preferences"));
    let gemini = fs::read_to_string(dir.join("live/GEMINI.md")).unwrap();
    assert!(
        gemini.contains("Core rules") && !gemini.contains("Owner preferences"),
        "skip=OWNER must apply"
    );
    let _ = fs::remove_dir_all(&dir);
}

#[test]
fn apply_is_idempotent() {
    let dir = workspace();
    run(&dir, &["apply", "--yes"]);
    let second = run(&dir, &["apply", "--yes"]);
    assert_eq!(second.status.code(), Some(0));
    assert!(
        !stdout(&second).contains("WROTE"),
        "second apply must change nothing: {}",
        stdout(&second)
    );
    let _ = fs::remove_dir_all(&dir);
}

#[test]
fn drift_is_detected_then_repaired_with_a_backup_and_receipt() {
    let dir = workspace();
    run(&dir, &["apply", "--yes"]);
    let live = dir.join("live/CLAUDE.md");
    fs::write(
        &live,
        fs::read_to_string(&live)
            .unwrap()
            .replace("Core rules", "Edited by hand"),
    )
    .unwrap();

    let check = run(&dir, &["check"]);
    assert_eq!(check.status.code(), Some(1));
    assert!(
        stdout(&check).contains("DRIFT") && stdout(&check).contains("differs: CORE"),
        "{}",
        stdout(&check)
    );

    assert_eq!(run(&dir, &["apply", "--yes"]).status.code(), Some(0));
    assert!(fs::read_to_string(&live).unwrap().contains("Core rules"));
    assert!(
        fs::read_dir(dir.join("backups")).unwrap().count() >= 1,
        "a backup of the replaced file is kept"
    );
    assert!(
        fs::read_dir(dir.join("receipts")).unwrap().count() >= 1,
        "a receipt is written"
    );
    assert_eq!(run(&dir, &["check"]).status.code(), Some(0));
    let _ = fs::remove_dir_all(&dir);
}

#[test]
fn apply_without_yes_refuses_and_writes_nothing() {
    let dir = workspace();
    let out = run(&dir, &["apply"]);
    assert_eq!(out.status.code(), Some(2));
    assert!(stderr(&out).contains("--yes"));
    assert!(!dir.join("live").exists());
    let _ = fs::remove_dir_all(&dir);
}

#[test]
fn a_block_the_template_never_places_is_an_error() {
    let dir = workspace();
    fs::write(dir.join("rules/accords/ORPHAN.md"), "## Orphan\n").unwrap();
    let out = run(&dir, &["check"]);
    assert_eq!(out.status.code(), Some(2));
    assert!(stderr(&out).contains("never places it"), "{}", stderr(&out));
    let _ = fs::remove_dir_all(&dir);
}

#[test]
fn render_stages_files_without_touching_live_targets() {
    let dir = workspace();
    assert_eq!(run(&dir, &["render"]).status.code(), Some(0));
    assert!(dir.join("out/codex").exists() && dir.join("out/claude").exists() && dir.join("out/gemini").exists());
    assert!(!dir.join("live").exists());
    let _ = fs::remove_dir_all(&dir);
}

#[test]
fn unknown_commands_print_usage() {
    let dir = workspace();
    let out = run(&dir, &["frobnicate"]);
    assert_eq!(out.status.code(), Some(2));
    assert!(stderr(&out).contains("usage:"));
    let _ = fs::remove_dir_all(&dir);
}
