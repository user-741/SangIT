"""
SangIT phone -> laptop sync watcher.

When you paste a Spotify playlist link into SangIT on your phone, the site files it as a
"[SangIT sync]" issue on the GitHub repo. This script checks for those every 20 seconds,
hands each link to local_sync.py (http://localhost:8080/sync) and closes the issue.

Run it next to local_sync.py, in a second PowerShell window:

    python sangit_watch.py

It needs the same GitHub token as the website (Issues: Read and write on user-741/SangIT).
Put it in a file called sangit_token.txt next to this script, or set GITHUB_SYNC_TOKEN.
Only Python's built-in modules are used.
"""
import json
import os
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime
from pathlib import Path

REPO = os.environ.get("GITHUB_REPO", "user-741/SangIT")
LOCAL_SYNC = os.environ.get("LOCAL_SYNC_URL", "http://localhost:8080/sync")
PREFIX = "[SangIT sync]"
EVERY = 20  # seconds


def load_token() -> str:
    token = os.environ.get("GITHUB_SYNC_TOKEN", "").strip()
    file = Path(__file__).with_name("sangit_token.txt")
    if not token and file.exists():
        token = file.read_text(encoding="utf-8").strip()
    if not token:
        sys.exit("No GitHub token. Put it in sangit_token.txt next to this script (or set GITHUB_SYNC_TOKEN).")
    return token


TOKEN = load_token()


def log(msg: str) -> None:
    print(f"[{datetime.now():%H:%M:%S}] {msg}", flush=True)


def github(path: str, method: str = "GET", body: dict | None = None):
    req = urllib.request.Request(
        f"{os.environ.get('GITHUB_API', 'https://api.github.com')}/repos/{REPO}{path}",
        method=method,
        data=json.dumps(body).encode() if body is not None else None,
        headers={
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "Authorization": f"Bearer {TOKEN}",
            "User-Agent": "sangit-watch",
            "Content-Type": "application/json",
        },
    )
    with urllib.request.urlopen(req, timeout=20) as res:
        return json.loads(res.read() or b"null")


def send_to_local_sync(url: str) -> bool:
    req = urllib.request.Request(
        LOCAL_SYNC, method="POST", data=json.dumps({"url": url}).encode(),
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as res:
            return 200 <= res.status < 300
    except urllib.error.HTTPError as e:
        log(f"local_sync.py answered {e.code} for {url}")
        return False
    except OSError:
        return False


def check() -> None:
    issues = github("/issues?state=open&per_page=50&sort=created&direction=asc")
    for issue in issues:
        if issue.get("pull_request") or not issue["title"].startswith(PREFIX):
            continue
        url = issue["title"][len(PREFIX):].strip()
        log(f"New request from your phone: {url}")
        if not send_to_local_sync(url):
            log("Couldn't reach local_sync.py - is it running? (python local_sync.py). Will retry.")
            return
        github(f"/issues/{issue['number']}/comments", "POST", {"body": "Sent to local_sync.py on the laptop."})
        github(f"/issues/{issue['number']}", "PATCH", {"state": "closed", "state_reason": "completed"})
        log("Sent to local_sync.py. Songs will show in SangIT a few minutes after they're uploaded.")


def main() -> None:
    log(f"Watching {REPO} for playlists sent from your phone (every {EVERY}s). Leave this window open.")
    while True:
        try:
            check()
        except urllib.error.HTTPError as e:
            if e.code in (401, 403):
                sys.exit("GitHub refused the token. Check sangit_token.txt (needs Issues: Read and write on the repo).")
            log(f"GitHub error {e.code}, retrying.")
        except OSError as e:
            log(f"No connection ({e}), retrying.")
        time.sleep(EVERY)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        pass
