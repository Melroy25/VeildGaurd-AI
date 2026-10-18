# VeilGuard AI: GitHub Repository Creation & Push Guide

This guide provides step-by-step instructions for the team to create the public GitHub repository, push the codebase with tags, verify repository hygiene, and attach release assets for Round 1 submission.

---

## 1. Create the GitHub Repository
1. Log in to [GitHub](https://github.com/).
2. Click **New repository** (or navigate to `https://github.com/new`).
3. Set **Repository name**: `veilguard-ai` (or your chosen project name).
4. Select **Public** visibility.
5. **IMPORTANT:** Leave **"Initialize this repository with a README" unchecked**. Do **not** add a `.gitignore` or license from GitHub's dropdown—the local workspace already contains complete, verified configurations.
6. Click **Create repository**.

---

## 2. Link Remote & Push from Local Workspace

Open PowerShell in the project directory (`e:\Projects\DevHost_2026`) and run:

```powershell
# 1. Add your new GitHub remote URL (replace with your actual repository URL)
git remote add origin https://github.com/<YOUR-USERNAME>/veilguard-ai.git

# 2. Push the main branch
git push -u origin main

# 3. Push all annotated release tags (including v0.1.0-round1)
git push origin --tags
```

---

## 3. Incognito Window Verification Checklist

Open an **Incognito / Private Browsing window** (logged out of GitHub) and navigate to your public repository URL:

- [ ] **Repository loads publicly** without login prompt.
- [ ] **README renders cleanly**: verify markdown tables, Mermaid diagrams, and code snippets format properly.
- [ ] **No secret files present**: verify that `.env`, `.veilguard/`, `.venv/`, `node_modules/`, and `policies/watchlist.yaml` are NOT listed in the repository tree.
- [ ] **Releases / Tags**: click **Tags** and confirm that tag `v0.1.0-round1` is visible.

---

## 4. Creating the GitHub Release & Attaching Assets

1. On GitHub, navigate to **Releases** $\to$ **Draft a new release**.
2. Click **Choose a tag** and select `v0.1.0-round1`.
3. Set **Release title**: `VeilGuard AI v0.1.0-round1: Round 1 Freeze (DevHack 2026)`.
4. Copy the release notes description from [`docs/GITHUB_ABOUT.md`](./GITHUB_ABOUT.md).
5. Attach the packaged extension zip file created by `scripts/package-extension.ps1`:
   - Location: `release/veilguard-extension-0.0.1.zip`
6. Click **Publish release**.
