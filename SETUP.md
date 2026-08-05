# Put Z3 Scout online

You can do the whole setup in a browser. Allow about 10 minutes, plus a few minutes for GitHub Pages to publish.

## 1. Upload the extracted folder

1. Sign in to [GitHub](https://github.com/).
2. Create a **new public repository**. A name such as `z3-scout` works well.
3. Leave “Add a README” unticked because this package already contains one.
4. On the empty repository page, choose **uploading an existing file**.
5. Drag in the contents of the extracted folder. Preserve the folders, including `.github`, `assets`, `data`, `scripts` and `tests`.
6. Commit the upload to the `main` branch.

If GitHub’s browser upload flattens folders, use GitHub Desktop instead: add the extracted folder as a local repository, publish it, and keep the repository public.

## 2. Turn on the website

1. In the repository, open **Settings → Pages**.
2. Under **Build and deployment**, choose **Deploy from a branch**.
3. Select branch **main**, folder **/(root)**, then **Save**.
4. GitHub will show the public address after deployment, normally:
   `https://YOUR-USERNAME.github.io/z3-scout/`

The first visit shows clearly labelled fictional demonstration listings. That proves the app is installed correctly.

## 3. Turn on daily discovery

The included collector uses [Serper](https://serper.dev/) to read Google-indexed result previews. This is optional and is the only third-party key the default setup needs.

1. Create a Serper account and copy an API key. Check its current pricing/quota before use.
2. In GitHub, open your repository’s **Settings → Secrets and variables → Actions**.
3. Choose **New repository secret**.
4. Name it exactly `SERPER_API_KEY`, paste the value, and save.
5. Open the repository’s **Actions** tab. If prompted, enable workflows.
6. Select **Refresh Z3 listings → Run workflow**.

The workflow runs automatically each day at 06:15 UTC and commits a fresh `data/listings.json`. The first successful live run removes the demonstration label.

If a source returns no public indexed results, the app will simply omit it and show a warning. Facebook Marketplace coverage is normally limited. Never put Facebook or Auto Trader login details into GitHub.

## 4. Add it to your iPhone

1. Open the GitHub Pages address in **Safari**.
2. Tap the **Share** button.
3. Choose **Add to Home Screen**, then **Add**.

It will open like a standalone app. Tap **Add advert** to score something found on any site; those personal additions and your saved list stay on that iPhone.

## Optional: add an advert to the public list

Edit `data/manual-listings.json` on GitHub. Keep it as a JSON array and add objects in this form:

```json
[
  {
    "id": "manual-unique-name",
    "title": "2001 BMW Z3 2.2 Sport",
    "price": 6250,
    "mileage": 72000,
    "year": 2001,
    "engine": "2.2",
    "source": "Facebook",
    "location": "Birmingham",
    "url": "https://www.example.com/original-advert",
    "description": "Full service history, 10 months MOT, new hood",
    "foundAt": "2026-08-05T08:00:00Z"
  }
]
```

Run **Refresh Z3 listings** again to score and publish it. Use a unique `id` for every advert.

## Change the search

Edit `sources.json`. You can disable a source with `"enabled": false`, change its query, or add another source. Keep queries specific to Z3 roadsters so accessories, Z4s and coupés do not swamp the results.

## Troubleshooting

- **Still seeing demo data:** confirm the secret name is exactly `SERPER_API_KEY`, then inspect the latest Actions run.
- **The Action cannot push:** under **Settings → Actions → General → Workflow permissions**, select **Read and write permissions**.
- **The app looks old:** tap the refresh button. If needed, close the home-screen app and reopen it; the offline cache updates from the network first.
- **A listing has a weak condition score:** the advert probably omits service/corrosion evidence. Open it and verify the facts; this cautious behaviour is intentional.
- **No Facebook results:** use the in-app **Add advert** form, or add selected finds to `data/manual-listings.json`. Direct automated Facebook collection is not included.
