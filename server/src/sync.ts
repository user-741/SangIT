// Phone -> laptop sync queue, kept as GitHub issues on the repo.
// The site files a "[SangIT sync] <link>" issue; sangit_watch.py on the laptop picks it up,
// passes the link to local_sync.py and closes the issue. Needs GITHUB_SYNC_TOKEN on Vercel:
// a fine-grained token for this repo with "Issues: Read and write".
const REPO = process.env.GITHUB_REPO ?? "user-741/SangIT";
const TOKEN = process.env.GITHUB_SYNC_TOKEN;
export const SYNC_PREFIX = "[SangIT sync]";
export const SPOTIFY_LINK = /^https:\/\/open\.spotify\.com\/(intl-[a-z]+\/)?(playlist|album)\/[A-Za-z0-9]+/;

export const syncConfigured = () => Boolean(TOKEN);

async function gh(path: string, init: RequestInit = {}) {
  const res = await fetch(`${process.env.GITHUB_API ?? "https://api.github.com"}/repos/${REPO}${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "sangit-sync",
      Authorization: `Bearer ${TOKEN}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
    },
  });
  if (!res.ok) throw new Error(`GitHub ${res.status}`);
  return res.json();
}

export async function queueSync(url: string): Promise<{ number: number }> {
  const clean = url.match(SPOTIFY_LINK)![0]; // drop ?si=... tracking bits
  const issue = (await gh("/issues", {
    method: "POST",
    body: JSON.stringify({
      title: `${SYNC_PREFIX} ${clean}`,
      body: `${clean}\n\nQueued from SangIT. sangit_watch.py on the laptop sends this to local_sync.py and closes it.`,
    }),
  })) as { number: number };
  return { number: issue.number };
}

export interface SyncItem { number: number; url: string; state: "waiting" | "sent"; at: string }

export async function recentSyncs(): Promise<SyncItem[]> {
  const issues = (await gh("/issues?state=all&per_page=30&sort=created&direction=desc")) as {
    number: number; title: string; state: string; created_at: string; pull_request?: unknown;
  }[];
  return issues
    .filter((i) => !i.pull_request && i.title.startsWith(SYNC_PREFIX))
    .slice(0, 5)
    .map((i) => ({ number: i.number, url: i.title.slice(SYNC_PREFIX.length).trim(), state: i.state === "open" ? "waiting" : "sent", at: i.created_at }));
}
