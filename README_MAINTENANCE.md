# W!bate — maintainable GitHub structure

This package keeps the existing app behavior while separating presentation and logic.

## Main files

- `index.html` — app markup only. Edit page structure here.
- `assets/css/app.css` — original layout/component CSS.
- `assets/css/theme-wbate.css` — W!bate youthful brand theme and visual overrides.
- `assets/js/app.js` — existing application logic. Keep changes here for behavior/data logic.
- `about.html` — brand introduction opened when the W!bate logo/title is pressed.
- `assets/css/about.css` — brand introduction page styling.
- `icons/`, `favicon.ico`, `site.webmanifest`, `browserconfig.xml` — install/browser icons and metadata.

## Safe maintenance rule

For appearance-only changes, edit `assets/css/theme-wbate.css` first.  
For wording/layout, edit `index.html` or `about.html`.  
For app behavior, calculations, localStorage, goals, transactions and wizard behavior, edit `assets/js/app.js`.

The refactor copied the original inline JavaScript into `assets/js/app.js` without changing its content.
