Deploy the Flask application directly to main branch and trigger Plesk auto-deployment.
Use this for hotfixes and small changes only. For new features, use /feature instead.

Steps:
1. Run `git branch --show-current` — warn if not on main
2. Run `git status` — show changed files
3. If no changes — tell user "Nothing to deploy" and stop
4. Ask: "What is your commit message? (Enter for auto)"
5. If empty — generate a descriptive message from the changed files
6. Run: git add . → git commit → git push origin main
7. Tell user:
   - ✓ Pushed to GitHub!
   - ⏳ GitHub Actions is deploying to Plesk...
   - 🌐 Live in ~30-60 seconds
   - Show: https://github.com/Md-Adheep/password_management_application/actions
8. If anything fails — show the error clearly and suggest a fix
