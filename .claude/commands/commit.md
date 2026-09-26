Review all staged and unstaged changes, then:

1. Run `git add .` to stage all changes.
2. Review the diff of staged changes and recent commit messages for style.
3. Write a concise, descriptive commit message that summarizes what changed and why. Follow conventional commit style (e.g., "feat:", "fix:", "refactor:", "chore:"). Do NOT commit files that may contain secrets (.env, credentials, API keys).
4. Commit the changes.
5. Push to the current remote branch (using `git push`). If no upstream is set, push with `-u origin <current-branch>`.
6. Show the final `git status` and confirm success.
