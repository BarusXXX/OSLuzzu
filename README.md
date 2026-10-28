```text
.----------------------------------------------------------------------.
|                                                                      |
|                           O S   L U Z Z U                            |
|                      THE MALTESE BOAT EXPLORER                       |
|                                                                      |
|                                    /|                                |
|                                   / |                                |
|                                  /  |                                |
|                                 /   |                                |
|                                /    |                                |
|                               /     |                                |
|                              /______|                                |
|                                     |                                |
|              __                     |              __                |
|             /  \____________________|_____________/  \               |
|             \    __________________________  <o>     /               |
|              \  /__________________________\       /                 |
|               \===================================/                  |
|                \_________________________________/                   |
|                                                                      |
|           ~  ~~~   ~~~~~   ~~~   ~~~~~   ~~~  ~                      |
|              ~~~    ~~~     ~~~~~    ~~~                             |
|                                                                      |
|           Eight boats. Two languages. A living craft.                |
|                                                                      |
'----------------------------------------------------------------------'
```

<div align="center">

**OSLUZZU v0.1.0** | **English + Maltese** | **MIT License**

[Development source](https://github.com/BarusXXX/OSLuzzuDev) |
[Buy me a coffee](https://buymeacoffee.com/kaneborg) |
[Credits and attribution](THIRD_PARTY_NOTICES.md)

</div>

**Discover the boats of Malta, one piece of timber at a time.**

OSLUZZU is an open-source, bilingual 3D explorer of Maltese boatbuilding,
created and maintained by **Kane Borg**. Step aboard eight educational
reconstructions, discover the names and purpose of their parts, and follow
the craft from hull stations to construction drawings.

This repository contains the ready-to-host website. Editable application
source, generation tools and tests live in
[OSLuzzuDev](https://github.com/BarusXXX/OSLuzzuDev).

## Come aboard

| Discover | What you can do |
| --- | --- |
| The collection | Explore the luzzu, kajjik, tal-Latini, firilla, xprunara, tal-pass, tal-midalji and an Italian gozzo comparison |
| The anatomy | Select components, learn their Maltese names and browse illustrated explanations |
| The construction | Section the hull, separate its parts and inspect frames, joints and fitted timber |
| The details | Try paint schemes, protective bow eyes, canvas shelters, oars and sail trim |
| The boatbuilder | Adjust hull stations, framing and construction parameters; rebuild the boat and its drawings |
| The drawing book | Browse profiles and export a complete A3 vector PDF, full-size SVG patterns and supporting data |
| The water | Explore wind, waves, rowing, steering and an underwater view |
| The history | Follow cited publications, visual references and the project's reconstruction notes |

The interface supports English and Maltese, including native spelling and
diacritics. Plain-keyboard searches work too. Shared links remember the boat,
language, selected part and inspection view. Drafts and custom finishes can be
saved locally on your device.

## Open the website locally

The website is already built. Serve this folder with a static HTTP server;
there is no application build or backend to install here.

For example, with Python 3 installed, open a terminal in this folder and run:

```sh
python -m http.server 8000 --bind 127.0.0.1
```

Then open **http://127.0.0.1:8000/** in a modern browser with WebGL support.
Use the local web address rather than opening `index.html` directly: the app
loads models, fonts, drawings and its authoring worker over HTTP.

## Publish on GitHub Pages

1. Put **all the contents of this folder** at the root of your publishing
   repository. Include the hidden `.nojekyll` file and every asset directory.
2. Push the files to your publishing branch, such as `main`.
3. In **Settings > Pages > Build and deployment**, choose
   **Source: Deploy from a branch**.
4. Select your publishing branch and **/(root)**, then click **Save**.
5. Open the website address shown in the repository's Pages settings once
   deployment completes.

Relative asset URLs support both a repository subpath and a custom domain.
Keep `index.html` beside `assets/`, `models/` and the other directories.
For another static host, upload this same folder structure.

See [GitHub's publishing guide](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site).

## Inside this repository

```text
OSLUZZU/
|-- index.html               Website entry point
|-- assets/                  Compiled app, styles and authoring worker
|-- models/                  Desktop and mobile 3D boats
|-- parameters/              Baseline boatbuilder records
|-- plans/                   Generated construction drawing packages
|-- generators/2.0.5/        Current construction generator and source manifest
|-- decoders/                Texture decoding resources
|-- fonts/                   Noto fonts and their Open Font License
|-- credits.html             Website credits and research bibliography
|-- LICENSE                  Project MIT license
|-- THIRD_PARTY_NOTICES.md    Attribution and licensing notes
|-- THIRD_PARTY_LICENSES.txt  Full third-party license and notice texts
|-- README.md                You are here
`-- .nojekyll                Static publishing marker for GitHub Pages
```

The app is **v0.1.0**; the construction generator is **v2.0.5**. These identify
different parts of the project. Parameter exports retain the generator version
and provenance needed to identify their construction rules.

## Support the next chapter

[**Buy me a coffee**](https://buymeacoffee.com/kaneborg)

Contributions fund the project's further development: better tools, more useful
drawings and continued work on the boat collection. Sometimes that means buying
actual coffee. Thank you for helping keep the project moving.

Measured surveys, historical corrections, terminology reviews and documented
workshop knowledge are welcome too. The app saves contribution drafts on your
device and lets you export them for review; it does not submit them automatically.
For source changes, build instructions and contribution guidance, visit the
[development repository](https://github.com/BarusXXX/OSLuzzuDev).

## License and acknowledgements

Copyright (c) 2026 **Kane Borg**. Original project software, documentation,
procedural models and illustrations are available under the [MIT License](LICENSE).
Retain the copyright and license notice when redistributing the project.

Third-party software, fonts and external reference works keep their own
licenses. Preserve [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md),
[THIRD_PARTY_LICENSES.txt](THIRD_PARTY_LICENSES.txt) and the
[Noto Open Font License](fonts/OFL.txt) when sharing this distribution.

Thanks to the authors of Three.js, three-bvh-csg, three-mesh-bvh, Meshoptimizer,
jsPDF, svg2pdf.js, GLTF Transform, Basis Universal, Zstandard, Noto and their
dependencies. The original water simulation also acknowledges conceptual
inspiration from David Greenheck's Tidewater.

Historical, photographic and language sources are credited in the app's
References panel and the included credits page. External articles and photographs
remain the work of their respective authors and are not relicensed by this
project's MIT license.

## A note on the reconstructions

These are educational reconstructions, with estimated dimensions and interpreted
details. Historical authenticity, Maltese terminology, measured surveys and
workshop allowances need specialist review. The water, sail and rowing models
use illustrative coefficients. The drawings are not certified boatbuilding plans.
