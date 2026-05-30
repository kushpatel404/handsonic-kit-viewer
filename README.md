# HandSonic Kit Viewer

A local browser app for inspecting Roland HandSonic HPD-20 `.HS0` backup files.

## Use

Open `index.html` in a browser, then choose a backup file. The app parses the HPD-20 kit table, shows the kits in a searchable list, and renders the 13-pad HandSonic surface with decoded assignment values.

## Host Online

This is a static site, so it can be hosted on GitHub Pages, Netlify, Vercel, Cloudflare Pages, or any basic web host. Publish only these app files:

- `index.html`
- `styles.css`
- `app.js`
- `README.md`
- optional hosting config files such as `netlify.toml` or `vercel.json`

Do not publish personal `.HS0`, `.HSO`, `.wav`, `.aif`, or `.aiff` files unless you intentionally want those sounds/backups public. They are ignored by `.gitignore`.

### Netlify Drop

1. Go to Netlify Drop.
2. Drag this project folder into the page.
3. Make sure backup/audio files are excluded before publishing.

### GitHub Pages

1. Create a GitHub repository.
2. Upload the app files to the repository root.
3. In repository settings, enable Pages from the main branch root.

### Vercel

1. Import the repository in Vercel.
2. Use the default static settings.
3. Deploy.

## Notes

The HPD-20 backup format is proprietary. This app decodes the kit table, user-instrument names, and playable PCM ranges it can identify from uploaded `.HS0` or `.HSO` backups. Pads whose assignment points to an empty or unresolved backup range use a generated preview tone.

The editor includes HandSonic versions of common pad-editor workflows: kit naming, volume/tempo/pad links, selected-pad Main/Sub/MIDI settings, sound-library play/import/delete/tag actions, kit init/duplicate/add/delete/reorder, and JSON project open/save. Project save includes imported wave data so editor work can be reopened.

`Save backup` creates an edited `.HS0` or `.HSO` copy of the uploaded HPD-20 backup for mapped kit name/order and pad assignment IDs. Imported wave allocation and unmapped HPD-20 parameter blocks are not written to the Roland binary yet; keep a project save for those edits and test edited Roland backups on a copy before relying on them on hardware.
