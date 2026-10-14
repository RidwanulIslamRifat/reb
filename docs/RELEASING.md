# Releasing reb

How a new version of reb gets to npm, so that `npx @ridwanul/reb setup` installs it. You do the
one-time setup once; after that every release is a few clicks on GitHub.

The npm token is stored **only** as a GitHub secret. It must never be written into any file in the
repository, a pull request, an issue or a chat.

## One-time setup

### 1. Create an npm account

1. Go to <https://www.npmjs.com/signup>.
2. Choose the **username** `ridwanul` (or sign in if you already have it). The package name
   `@ridwanul/reb` means "the package reb under the name ridwanul", so it must be published from that
   account.
3. Enter your email and a strong password, and confirm the email npm sends you.
4. Turn on two-factor authentication: click your profile picture (top right), **Account**,
   **Two-Factor Authentication**, **Enable 2FA**, and follow the steps with an authenticator app.
   npm requires this for publishing.

### 2. Create an access token

The token lets GitHub publish on your behalf.

1. On npmjs.com, click your profile picture, then **Access Tokens**.
2. Click **Generate New Token**, then **Granular Access Token**.
3. Fill in:
   - **Token name**: `reb GitHub release`
   - **Expiration**: the longest allowed (npm limits tokens that can publish to 90 days; put a
     reminder in your calendar to make a new one before it runs out).
   - **Bypass two-factor authentication**: tick it. GitHub cannot type your 2FA code.
   - **Packages and scopes**: Permissions **Read and write**; choose **All packages** for the first
     release (the package does not exist yet, so you cannot pick it). After the first release you can
     make a new token limited to `@ridwanul/reb` only.
   - **Organizations**: leave as **No access**.
4. Click **Generate Token**. npm shows the token once; it starts with `npm_`. Copy it. Do not paste
   it anywhere except step 3 below.

### 3. Store the token as a GitHub secret

1. Open <https://github.com/RidwanulIslamRifat/reb>.
2. Click **Settings** (top bar of the repository), then on the left **Secrets and variables**,
   then **Actions**.
3. Click **New repository secret**.
4. Publishing uses npm trusted publishing; no token needed.
5. Click **Add secret**. GitHub hides the value from now on; nobody, you included, can read it back.
   To change it later, click the pencil next to `NPM_TOKEN` and paste a new token.

That is all. The release workflow (`.github/workflows/release.yml`) reads the secret when it runs.

## Every release

1. **Pick the version number** (see the top of [CHANGELOG.md](../CHANGELOG.md)): bug fixes only →
   raise the last number (1.0.0 → 1.0.1); new features → the middle number (1.0.0 → 1.1.0);
   something people rely on changes → the first number (1.0.0 → 2.0.0).
2. **Prepare it in a pull request**: set `"version"` in `package.json`, move the "Unreleased" notes
   in `CHANGELOG.md` under a new heading with the version and date, and merge the pull request when
   the checks are green. (Your coding agent can do this: "Prepare release 1.0.1".)
3. **Create the GitHub release**:
   1. On the repository page, click **Releases** (right side), then **Draft a new release**.
   2. **Choose a tag**: type `v` plus the version, for example `v1.0.0`, and click
      **Create new tag on publish**. Target: `main`.
   3. **Release title**: the same, `v1.0.0`. Description: paste that version's CHANGELOG notes.
   4. Click **Publish release**.
4. **Watch it publish**: open the **Actions** tab. A run called **Release** starts. It checks that
   the tag matches `package.json`, runs every test, builds reb and publishes it. A green tick (about
   5 minutes) means it is on npm.
5. **Check it yourself**, on any computer with Node.js 22:
   ```sh
   npx @ridwanul/reb@latest --version
   ```
   You should see the new version number.

## When something goes wrong

- **"The release tag is v1.0.1 but package.json says 1.0.0"**: the tag and the version differ.
  Delete the release and its tag on GitHub, fix the version in a pull request, and release again.
- **"401 Unauthorized" or "403 Forbidden" in the publish step**: the token is missing, expired or
  lacks write permission, or you are not signed in to npm as `ridwanul`. Make a new token (step 2)
  and replace the `NPM_TOKEN` secret (step 3).
- **"You cannot publish over the previously published versions"**: that version is already on npm.
  Raise the version and release again; npm never lets a version number be reused.
- **A test fails**: nothing was published. Fix it in a pull request and release again with a new tag.

## Optional, more secure: publishing without a token

npm also supports "trusted publishing", where GitHub proves who it is and no token is stored at all.
It needs a setting on the package page on npmjs.com, which exists only after the first release. Ask
your coding agent to switch the workflow over once 1.0.0 is published.
