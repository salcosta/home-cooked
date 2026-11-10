# HomeCooked

A mobile-first React PWA and Node/Express household kitchen app. Requires Node 22 or newer.

## Run

```sh
npm install
npm run dev
```

Open http://localhost:5173. The API runs on port 3001. For a production build, run `npm run build` then `npm start` and open http://localhost:3001. Both customer and fulfiller interfaces share this app, with navigation based on profile role. Desktop support is through the responsive web app; there is no native desktop wrapper.

Starter profiles: Alex (admin), Sam (cook), Jamie and Riley (customers). All start with PIN **1234**. Change PINs in Manage kitchen before sharing. PINs are scrypt hashed; sessions expire after 24 hours and are reset by a server restart. Login attempts are limited per IP. Use HTTPS and a trusted household network; this bootstrap does not include production account recovery, distributed sessions or internet-facing security hardening.

## Included

- Profile/PIN sign-in, profile pictures, light and dark themes.
- Fictional restaurant collections, recipe search, upvotes, mixed-restaurant meal requests.
- Meal acceptance, scheduling, shopping/prep/cooking/ready tracking, rating and searchable cooked history.
- Cook recipe tabs, screen wake lock where supported, timer, cooking and final photos.
- Shopping ingredients, prices, notes, purchase dates and receipt photos.
- Admin Markdown editing, image drop/paste, recipe hiding/moving/archiving, restaurant images/logos and user creation/editing.
- Free-form dishes become recipe records. Recipe deletion archives records to preserve meal history.
- PWA manifest and production service worker caching the app shell. API writes require connectivity. Install availability depends on browser; SVG icons may need PNG variants for some mobile platforms.

## Data

On first launch, `data/index.json` and the `recipes`, `meals`, `restaurants`, `likes`, `users`, and `ingredients` collections are created. Likes are stored together as an array in `data/likes.json`; existing like folders are migrated automatically on server startup and removed after the file is saved. Each other record lives at `data/<collection>/<id>/record.json`, alongside its uploaded assets. Recipes and meals have a `recipe.md` file. Set `DATA_DIR` to change the storage root; back up that whole directory. It is ignored by Git. The store is intended for one Node process and a small household, not concurrent server instances. Meal Markdown is initialized for future notes editing; the current UI edits recipe Markdown only.

Seed recipes contain illustrative instructions, not tested cooking guidance. Replace them with complete recipes before use. Food photos use Unsplash and fonts use Google Fonts, both requiring internet access. Uploaded images are publicly readable by their unguessable asset URLs; JSON and Markdown files are not exposed by the asset route.

## Ingredient management

**Manage kitchen → Ingredients** lists ingredients from recipes and the shopping list. Admins can edit each ingredient's display name and price, and add, replace, or remove its picture. Display names appear on the shopping list; original recipe wording and Markdown remain unchanged. Picture changes save immediately; use **Save ingredient** for name and price changes. Removing a picture clears its association; previously uploaded files remain in the record folder.

Recipe ingredients are added to the catalog at server startup and when recipe ingredient lists are saved. Catalog-only entries are not shown on the shopping list until added for shopping. Adding an existing ingredient by its original name reuses its saved price, display name, and picture.

## Recipe tags

Admins can add restaurants in **Manage kitchen → Restaurants** using **Add a restaurant**. Enter a name and optionally a cuisine, description, and logo emoji. After creation, upload a header photo or logo from its restaurant card. Assign dishes to the restaurant using the recipe editor. New restaurants appear in Discover immediately.

## Recipe tags

Admins can create tags in **Manage kitchen → Tags**, then select or deselect tags in a recipe's editor and save. Multiple tags can be assigned to each recipe; they appear on recipe cards. Tag names are limited to 50 characters and duplicates are rejected regardless of case. Tags are stored at `data/tags/<id>/record.json`; recipes reference them with a `tagIds` array. Existing and imported recipes start without tags.

## Cooking a planned meal

In Meal planner, **Start Meal** changes a meal to **Prepping** and opens Cook Mode. Cook Mode contains recipes from meals in **Prepping** or **Cooking** only. Swipe horizontally, use the recipe tabs, or use the previous/next buttons to switch recipes. Tap an instruction to check it off; numbered lists and bullets under Method, Steps, Instructions, Directions, or Preparation headings support checkoffs. Checkoffs are stored on this browser per meal and recipe.

Named timers stay beneath the header across screens. Their elapsed-time fill changes from blue to green at 40%, yellow at 75%, and red at 90%. Stop freezes a timer; close removes it. Timers are stored on this browser per profile and use wall-clock deadlines so the countdown catches up after backgrounding or reloading. They do not provide background system notifications.

Save note appends to the recipe's Markdown **Notes** section, creating it if missing and keeping it at the bottom. Notes are saved on the server and visible to everyone who can view the recipe. Mark recipe ready marks only the selected recipe and can be undone. Recipes stay in Cook Mode until every recipe in the meal is ready and you select **Mark everything done** at the top. This finishes the meal, preserves it in meal history, and removes its recipes from Cook Mode. Recipe readiness is saved on the server.

## Import recipe files

With the server running, drop `.md` or `.markdown` files directly into `data/recipes/` (or `<DATA_DIR>/recipes/`). The scanner checks every two seconds and imports after a file remains unchanged across two checks, including files present at startup. Finish copying large files before renaming them to `.md` to avoid importing a paused copy.

`Chicken Soup.md` becomes `recipes/chicken-soup/recipe.md` with a generated `record.json`. Existing folder names are preserved; collisions use `chicken-soup-2`, `chicken-soup-3`, and so on. The Markdown contents are preserved. The first level-one heading supplies the recipe name, falling back to the filename. New recipes appear under The Comfort Kitchen; use the admin editor to move them. Ingredients and cook time start empty/zero. Other file types and files already inside record folders are left alone. The app refreshes recipe data every 15 seconds.

## Windows service

The service wrapper uses [WinSW 2.12.0](https://github.com/winsw/winsw/releases/tag/v2.12.0). Install Node 22 or newer and place the app on a fixed local disk, such as `C:\Apps\HomeCooked`. Mapped drives such as a network `Z:` drive are not supported by this installer. Keep this folder in place after installing. Copy your existing `data` folder too if moving the app, with the old app stopped.

From the application directory, install dependencies and build:

```powershell
npm ci
npm run build
```

Then open **PowerShell as Administrator**, change to that same application directory, and run:

```powershell
npm run service:install
```

This downloads the pinned WinSW release, registers **HomeCooked**, starts it, and checks its HTTP endpoint. The app is available at `http://localhost:3001`. It starts automatically after Windows boots and restarts after a crash. The service uses the low-privilege LocalService account. Installation copies the selected Node executable into `.service/runtime/node.exe` so NVM or user-profile permissions do not prevent startup. To upgrade that service runtime later, stop the service, copy the new Node executable over that file, and start the service again. The installer grants that account read/execute access to the app directory and modify access to the data and log directories. Configuration and rotating logs live in `.service/`; data stays in `data/` by default. No service is installed during `npm run build`.

For phone access on your private local network, an alternate port, or an existing data directory, use:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/windows-service.ps1 -Action Install -Port 3001 -DataDirectory C:\HomeCookedData -AllowPrivateNetwork
```

`-AllowPrivateNetwork` creates an inbound firewall rule for the selected port, limited to the private profile and local subnet. Omit it to leave firewall settings alone. Phone access uses the computer's LAN address; installing a service does not configure HTTPS.

Management commands (Administrator required except status):

```powershell
npm run service:status
npm run service:stop
npm run service:start
npm run service:restart
npm run service:uninstall
```

For updates, stop the service, update source/dependencies, run `npm run build`, then start it. Do not run a second server against the same data folder. To change service paths or port, uninstall and reinstall with the new options. Uninstall preserves application files, data, logs, and file permissions; it removes the service and any HomeCooked firewall rule created by the installer. If installation reports a startup error, inspect `.service/logs` before retrying. An installed service must be uninstalled before rerunning Install.

To generate and validate the XML without downloading WinSW, changing permissions, or installing a service:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/windows-service.ps1 -Action Prepare
```

## Checks

```sh
npm test
npm run build
```

No hosting is configured: the filesystem-based Node backend needs a persistent disk. Static-only deployment cannot run this backend. Native mobile/desktop binaries, push notifications and offline write synchronization are not included in this bootstrap.

## Requested foods

Requesting a dish adds it directly to Requested Foods. Requests for the same recipe are combined until that food is marked ready or its meal is completed, with each person listed once under Requested by. Requests can still join a food after it is assigned to a meal. After cooking, a new request starts a fresh entry.

Cooks select unassigned foods and move them into a new meal or an existing meal that has not started cooking. Meals and Meal planner keep scheduling, cooking, ratings, and history. Requests are saved in the requests collection and retain their requester names through meal history. On startup, old meals still in Requested status are converted into individual food requests; their original records are retained. Accepted and later meals remain unchanged.
