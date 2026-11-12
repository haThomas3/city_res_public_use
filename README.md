# Portfolio City (template)

A portfolio built as a small interactive 3D city. Districts are fields of work, buildings are projects, and a building's height and footprint come from the size of the project. Projects that are not finished yet stand on a construction site, with a crane, scaffolding, a brick pile and a safety fence.

This repo is a neutral copy: it contains an invented person ("Alex Example") and invented projects, and nothing personal. Make it yours in five steps.

## Make your own city

1. **Use this repo.** Click *Use this template* on GitHub (or fork or clone it) and pick a repository name, for example `my-city`.
2. **Edit `content/city.json`.** This one file holds everything: your name, links, districts and projects. Replace the sample content. Everything in it is public once pushed, so never put secrets, private repo names, client names or personal data in it.
3. **Edit `index.html`.** Change "Your Name", the initials in the badge, the LinkedIn link and the page title and description.
4. **Add screenshots (optional).** Put images in `public/projects/<project-id>/` and list them under `gallery` in the project.
5. **Publish.** Push to `main`. In the repo settings, open *Pages* and choose *GitHub Actions* as the source. The included workflow validates the content, runs the tests, builds with the right base path and deploys to `https://<you>.github.io/<repo>/`.

Check your content any time with `npm run validate`.

## Commands

```bash
npm install
npm run dev        # local dev server
npm run validate   # check content/city.json against the schema
npm test           # layout and routing tests
npm run build      # typecheck and production build into dist/
```

URL parameters: `?time=day|dusk|night` forces the lighting, `?lang=he` opens in Hebrew.

## The content file

```jsonc
{
  "id": "my-project",               // URL slug: #/project/my-project
  "district": "web",                // one of the district ids
  "tier": "featured",               // featured | more | optional (base height)
  "access": "public",               // public | private (private = no source link)
  "status": "construction",         // optional: not finished yet, drawn as a construction site
  "title": "My Project",
  "tagline": { "en": "One line.", "he": "שורה אחת." },
  "description": { "en": "...", "he": "..." },
  "stack": ["Python", "FastAPI"],
  "links": { "github": "https://github.com/...", "demo": "https://..." },
  "gallery": [{ "src": "projects/my-project/shot1.webp", "caption": "..." }],
  "floors": [{ "name": "Parser", "detail": "..." }],   // one floor per module, bottom first
  "size": { "linesOfCode": 6900, "tests": 68, "months": 3, "teamSize": 2 },
  "sign": "NEON"                    // optional neon sign, up to 14 characters
}
```

Any text field can be a plain string (English only) or `{ "en": ..., "he": ... }`. Drop the Hebrew if you do not need it.

To move a project out of the construction site when it is ready, change its `district` and delete `"status": "construction"`.

### How a building is sized

- **Height:** tier base, plus lines of code (log), tests, months and number of floors, rounded and clamped to 1 to 12. `heightOverride` wins.
- **Footprint:** grows with team size.
- **Placement:** automatic. Each district gets a wedge sized by its content, and buildings fill rings from the plaza outward. `place` pins one by hand.

## Analytics (optional)

Set `site.clarityId` to a Microsoft Clarity project ID to turn analytics on. Leave it empty and nothing runs. Visitors see a consent bar first, and Clarity loads only after they accept.

## Stack

Vite, TypeScript (strict), three.js, plain HTML and CSS for the overlay, GitHub Actions for validate, test, build and deploy.
