# LeetGit

Automatically sync your accepted LeetCode submissions to GitHub in real time, with one-click bulk sync for all your past solves.

LeetGit combines real-time submission tracking with an interruption-proof historical bulk sync engine that brings your entire solve history into GitHub without triggering secondary rate limits.

---

## Features

- **Real-Time Auto-Sync:** Listens directly to accepted solutions (`status_code: 10`) upon submission on LeetCode and automatically commits problem statements, stats, and source code.
- **Historical Bulk Sync:** One-click sync that scans your entire submission history via LeetCode's GraphQL API, deduplicates multiple attempts (retaining the latest solve per language), and pushes your past grind to GitHub.
- **Zero-Backend OAuth:** Authenticates securely using GitHub's Device Flow with client-side autofill—no server proxy or exposed client secrets required.
- **Automated Repo Setup:** Link an existing repository or have LeetGit automatically create and initialize a private repository for you.
- **Interruption Resilient:** Sync progress is recorded per problem in `chrome.storage.local`. If your network drops or browser closes mid-sync, LeetGit resumes right where it stopped without duplicating files.
- **Clean Structure:** Generates individual problem folders with dedicated `README.md` files (problem statement, difficulty, and runtime stats) and source code in the matching language extension.

---

## Installation (Developer Mode)

1. Clone or download this repository:
```bash
git clone https://github.com/your-username/leetgit.git
```
2. Open Google Chrome and go to `chrome://extensions/`.
3. Enable **Developer mode** using the toggle in the top-right corner.
4. Click **Load unpacked** (top-left) and select the `leetgit` directory.
5. Pin **LeetGit** to your browser toolbar for quick access.

---

## How to Use

### 1. Connecting with GitHub (Login)
1. Click the **LeetGit** icon in your Chrome toolbar.
2. Click **Connect with GitHub**.
3. A new tab will open to GitHub's Device Authorization page:
   - LeetGit automatically pastes your one-time code and clicks **Continue**.
4. Click the green **Authorize LeetGit** button to grant repository access.
5. Return to the popup—it will advance to repository configuration.

---

### 2. Linking or Creating a Repository
Once authenticated, configure your destination repository:

- **Create a new repository (Recommended):**
  - Keep **"Create as new private repository"** checked.
  - Enter your preferred repository name (e.g., `leetcode-solutions`).
  - Click **Save & Link Repository**. LeetGit will create the repository under your account, initialize the default branch, and link it.
- **Link an existing repository:**
  - Uncheck the box.
  - Enter the full path or name: `username/existing-repo-name`.
  - Click **Save & Link Repository**.

---

### 3. Real-Time Auto-Sync
1. Navigate to any problem on [LeetCode](https://leetcode.com/problems/).
2. Solve the problem and click **Submit**.
3. If your solution is **Accepted**, a toast notification will appear in the bottom-right corner:
   - `LeetGit: Syncing <problem-name>...`
   - `LeetGit: Synced <problem-name> to GitHub!`
4. Both the problem description and your solution are pushed directly to your repo.

---

### 4. Historical Bulk Sync
To backfill problems solved prior to installing LeetGit:

1. Open the **LeetGit** popup.
2. Under the dashboard, click **Bulk Sync All Past Solves**.
3. LeetGit will:
   - Paginate through your LeetCode history via GraphQL.
   - Filter and deduplicate to find your latest accepted solution per problem.
   - Commit files in throttled batches (250ms delay) to avoid triggering GitHub abuse rate limits.
   - Show live progress updates (`Syncing: X/Y problems...`).
4. Once completed, the button updates to **All Solves Up to Date**.

---

### 5. Managing Settings (Change Repo or Disconnect)
Click the **gear icon** in the top right of the dashboard to open Settings:

- **Change Repository:** Unlinks the active repository and returns you to the repository setup screen.
- **Disconnect GitHub:** Clears local credentials, revokes session storage, and resets the extension to the login screen.

---

## Architecture & Tech Stack

- **Platform:** Chrome Extension (Manifest V3)
- **Authentication:** GitHub OAuth Device Authorization Flow 
- **Data Harvesting:** LeetCode GraphQL API (`submissionList`, `submissionDetails`, `questionDetails`)
- **Git Operations:** GitHub REST API v3 (`/repos/{owner}/{repo}/contents/{path}`)
- **State Storage:** `chrome.storage.local`

---

## Contributing

Contributions, issues, and feature requests are welcome!

1. Fork the repository
2. Create your branch (`git checkout -b feature/NewFeature`)
3. Commit your changes (`git commit -m 'Add NewFeature'`)
4. Push to the branch (`git push origin feature/NewFeature`)
5. Open a Pull Request

---

