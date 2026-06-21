import { execSync } from "node:child_process";

export function resolveGitHubToken(): string | null {
  // 1. Env var
  if (process.env["GITHUB_TOKEN"]) return process.env["GITHUB_TOKEN"];

  // 2. gh CLI passthrough
  try {
    const token = execSync("gh auth token", { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
    if (token) return token;
  } catch {
    // gh not installed or not authenticated
  }

  // 3. OAuth is handled at the web layer — return null so caller can redirect
  return null;
}
