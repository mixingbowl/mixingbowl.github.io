# Kitchen Notebook

A free recipe and shopping-list website. Anyone can create an account, save recipes, build a shopping list, and cook step by step on a phone or computer. Each person's recipes, list and progress are private to their account.

It runs on two free services:

- **Supabase** stores accounts, recipes, lists and photos.
- **GitHub Pages** hosts the website itself.

Setup takes about 30 minutes, and you only do it once.

---

## Step 1: Create the database (Supabase)

1. Go to **supabase.com** and sign up (free; signing in with GitHub works).
2. Click **New project**. Name it `kitchen`, create a database password (save it somewhere), pick a region near you (for example, US East), and click **Create**. It takes a minute or two.
3. In the left sidebar, open **SQL Editor** and click **New query**. Open `schema.sql` from this folder, copy all of it, paste it in, and click **Run**. You should see "Success. No rows returned."
4. In the left sidebar, open **Project Settings → API** (on newer dashboards it may be called **API Keys**). Copy two things:
   - the **Project URL** (looks like `https://abcdxyz.supabase.co`)
   - the **anon public** key (newer dashboards call it the **publishable** key)

## Step 2: Put the website online (GitHub Pages)

1. Go to **github.com** and sign up (free).
2. Click **+ → New repository**. Name it `kitchen`, set it to **Public**, and click **Create repository**.
3. On the new repository page, click **uploading an existing file**. Drag in **every file in this folder** (not the folder itself), then click **Commit changes**.
4. Open the file `config.js` in GitHub and click the ✏️ pencil. Replace `YOUR_SUPABASE_URL` and `YOUR_SUPABASE_ANON_KEY` with the two values from Step 1, keeping the quotes. Click **Commit changes**.
5. Go to **Settings → Pages**. Under "Build and deployment", choose **Deploy from a branch**, branch **main**, folder **/ (root)**, then click **Save**.
6. After a minute or two, your site is live at `https://YOUR-GITHUB-USERNAME.github.io/kitchen/`.

## Step 3: Connect the two

In Supabase, go to **Authentication → URL Configuration**:

- Set **Site URL** to your site address from Step 2.
- Under **Redirect URLs**, add the same address.

This makes the confirmation and password-reset emails link back to your site.

**About email confirmation:** by default, new accounts must click a confirmation email. Supabase's free email service only sends a few emails per hour. That's fine for family, but if sign-ups get stuck, either:

- turn confirmation off in **Authentication → Sign In / Providers → Email → Confirm email**, or
- add your own email sender under **Authentication → Emails → SMTP**.

## Step 4: Use it

- Open the site, tap **Create an account**, and you're in.
- **iPhone:** in Safari, tap Share, then **Add to Home Screen** to get an app icon.
- **Android:** in Chrome, tap ⋮, then **Add to Home screen**.
- Send the link to anyone. Each person makes their own account and gets their own separate kitchen.

## Making changes later

Any change to these files on GitHub goes live for everyone within a minute or two. To let Claude make the changes, connect GitHub to Claude (claude.ai → Settings → Connectors → GitHub) and ask.

## Good to know

- **Inactive projects pause.** Supabase pauses a free project after about a week with no activity. If the site says it can't reach your kitchen, open the Supabase dashboard and click **Restore project**. Nothing is lost.
- **The key in `config.js` is meant to be public.** The rules in `schema.sql` make sure people can only see and change their own data.
- **Free limits are generous for family use:** 500 MB of database and 1 GB of photo storage.
