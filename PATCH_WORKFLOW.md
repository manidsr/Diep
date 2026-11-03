# AI patch workflow (Windows)

This workflow is designed for an AI that can read the GitHub repository in its context but cannot edit your local working directory.

## One-time setup

1. Put `AI_CONTEX.md`, `CLAUDE_PROJECT_INSTRUCTIONS.md` (or paste its contents into Claude's **Set project instructions**), and `apply_patch.bat` in the repository root.
2. Commit these baseline files so every future AI account can read the same handoff document from GitHub.
3. Make sure Git for Windows is installed.

## Every AI coding session

1. Push/commit the latest local code to the GitHub branch the AI can read. The AI can only base a patch on code it can actually see.
2. Open Claude with the repository connected and use the project instructions.
3. Ask for one focused task. Claude must inspect the current files and return one `.patch` attachment, including an `AI_CONTEX.md` update.
4. Save the patch outside the repository, such as in `Downloads`.
5. Commit or stash all local work first. The patch runner refuses to apply patches to a dirty working tree.
6. Run from the repository root, or double-click the batch file and provide the patch path:

   ```bat
   apply_patch.bat "C:\Users\YourName\Downloads\change.patch"
   ```

7. Review and test:

   ```bat
   git status --short
   git diff --check
   git diff
   ```

8. Run the test/build/device checks specified by the AI. If everything is good, commit the changes and push them so the next Claude account sees the updated code and `AI_CONTEX.md`.

## Recovery

Before applying a patch, the script creates a branch named `backup/ai-patch-...` pointing to the pre-patch commit. If you need to discard the patch and have not made other work you want to keep since applying it:

```bat
git reset --hard backup/ai-patch-...
```

Use the exact branch name printed by the script. `reset --hard` discards uncommitted changes, so do not use it after doing additional work you want to keep.

## Important limits

- A Git patch is not a magic sync. It applies only when your local repository is sufficiently close to the source version the AI inspected.
- The batch file checks that the working tree is clean and runs `git apply --check` before applying.
- The patch itself does not prove the game builds or works. Run tests and manually test real devices on the hotspot.
- Save the `.patch` outside the repository; otherwise its untracked file may make the working tree check fail.
