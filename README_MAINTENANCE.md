# W!bate — maintainable GitHub structure

This package keeps the existing app behavior while separating presentation, shared navigation, transitions and application logic.

## Main files

- `index.html` — app markup only. Edit page structure here.
- `assets/css/app.css` — original layout/component CSS.
- `assets/css/theme-wbate.css` — W!bate youthful brand theme and app visual overrides.
- `assets/css/navigation.css` — shared fixed W!bate header, home month/offer command deck and page-navigation animation.
- `assets/js/app.js` — existing application logic. Keep changes here for behavior/data logic.
- `assets/js/page-transitions.js` — lightweight forward/back navigation animation shared by App and About.
- `about.html` — brand introduction opened when the W!bate logo/title is pressed.
- `assets/css/about.css` — brand introduction page-specific styling.
- `icons/`, `favicon.ico`, `site.webmanifest`, `browserconfig.xml` — install/browser icons and metadata.

## Home header / actions

The home header and About header use the shared `.brand-nav` component from `navigation.css`.

The home month picker and “新增優惠” action intentionally sit below the fixed brand header:

- Month is treated as a **view/filter control**.
- “新增優惠” is treated as the **primary content action**.
- On narrow screens the two controls stack automatically.

Do not rename `monthPicker` or `settingsBtn` unless the matching selectors in `assets/js/app.js` are also intentionally updated.

## Page transition links

Links using `data-page-transition="forward"` or `data-page-transition="back"` are handled by `page-transitions.js`.

- App → About uses `forward`.
- About → App (“返回”, centered W!bate brand, “開始使用 W!bate”, and footer “返回 App”) uses `back`.
- `prefers-reduced-motion` disables the transition animation for accessibility.

## Safe maintenance rule

For app-theme appearance changes, edit `assets/css/theme-wbate.css` first.  
For shared Header / navigation / month and offer command UI, edit `assets/css/navigation.css`.  
For About-only styling, edit `assets/css/about.css`.  
For wording/layout, edit `index.html` or `about.html`.  
For app behavior, calculations, localStorage, goals, transactions and wizard behavior, edit `assets/js/app.js`.

The existing `assets/js/app.js` application logic was not changed for this header/navigation revision.

## Mobile compact home refinements

The home screen now loads `assets/css/home-refinements.css` after the shared theme/navigation styles. This file contains only visual overrides for the home screen:

- On screens up to 500px, the month picker and **新增優惠** action stay on one compact 50px row instead of stacking into two rows.
- `.spend-progress-shell` and `.tier-progress-shell` are transparent positioning canvases; they must not receive a panel/background colour.
- All goal/progress cards use one equal height: 188px normally and 184px on phones up to 500px.
- No application logic was changed for this refinement. `assets/js/app.js` remains byte-identical to the previous release.

If the mobile home layout needs further tuning, prefer editing `home-refinements.css` rather than adding another override to `app.css`.
