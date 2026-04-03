Manage feature branch development for the Flask application.

Ask the user what they want to do:
1. "Start a new feature" — ask for feature name — run: ./feature.sh start "name"
2. "Push current feature" — ask for commit message — run: ./feature.sh push "message"
3. "Go live (merge to main)" — show summary first — run: ./feature.sh done
4. "Check status" — run: ./feature.sh status
5. "List all features" — run: ./feature.sh list
6. "Discard feature" — warn strongly about data loss — run: ./feature.sh discard

After each action, explain what happened and what the next step should be.
If merging to main, confirm with the user that GitHub Actions will deploy to the live server at nextgen.codesen.com.
