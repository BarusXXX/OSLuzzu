# Credits and third-party notices

OSLUZZU is created and maintained by **Kane Borg**. The project's original
software, documentation, procedural models and illustrations are provided under
the [MIT License](LICENSE). Separately credited third-party material retains its
own copyright and license.

## Software and fonts

| Component | Credit | License |
| --- | --- | --- |
| Three.js | three.js authors | MIT |
| three-bvh-csg and three-mesh-bvh | Garrett Johnson | MIT |
| Meshoptimizer | Arseny Kapoulkine | MIT |
| jsPDF | James Hall, yWorks GmbH and contributors | MIT |
| svg2pdf.js | yWorks GmbH and contributors | MIT |
| GLTF Transform authoring tools | Don McCurdy and contributors | MIT |
| Basis Universal transcoder | Binomial LLC | Apache-2.0 |
| Zstandard in the Basis transcoder | Facebook, Inc. and contributors | BSD-3-Clause |
| Noto Sans and Noto Serif | The Noto Project Authors | SIL Open Font License 1.1 |
| cdt2d and bundled numeric helpers | Mikola Lysenko | MIT |

[THIRD_PARTY_LICENSES.txt](THIRD_PARTY_LICENSES.txt) contains the complete license
and notice files for the installed production dependency tree, the GLTF Transform
authoring tools, the bundled cdt2d helpers, Basis Universal, Zstandard and Noto.
It is regenerated from the installed, lockfile-pinned packages by `npm run notices`
and automatically during the production build. This includes transitive software
such as DOMPurify, html2canvas, canvg, pako, fflate, the Babel runtime and their
dependencies. DOMPurify retains its upstream Apache-2.0 / MPL-2.0 choice; pako
retains its MIT and zlib notices. Their licenses do not replace the project's MIT
license.

The Basis transcoder files and Noto fonts are redistributed unmodified. Their
upstream notices are preserved in `licenses/` and `public/fonts/OFL.txt`. The
current generator archive preserves the dependency lock used to construct its
models, even when the application's metadata or interface changes later.

## Historical, photographic and language references

The complete bibliography is recorded in `src/content/catalogue.json`, displayed
in the app's References panel, and reproduced with author, title, date and source
link on the published `credits.html` page. These authors retain ownership of
their articles, photographs and other source material; the project's MIT license
does not relicense the external works.

In particular, the protective-eye studies cite:

- **AntonellaVella (Antonella Vella)**, *Luzzu eye*, 23 March 2023.
  [Original photograph](https://commons.wikimedia.org/wiki/File:Luzzu_eye.jpg),
  [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).
- **Lance Anthony**, *Eye of Osiris*, 5 February 2014.
  [Original photograph](https://commons.wikimedia.org/wiki/File:Eye_of_Osiris.jpg),
  [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).

These photographs are cited visual references; the photograph files are not
bundled. The project supplies procedural geometry and vector illustrations,
with reconstructed dimensions and interpreted decoration. Any future reuse or
adaptation of the photographs must retain the photographer credit, source and
license link, identify changes, and follow the applicable share-alike terms.

Joseph Muscat, Stephanie Said, Guzi Gatt, Efthymia Akrivopoulou, Irene Munoz,
Joseph Serracino, Kliem u Storja, ICH Malta, the Culture Directorate of Malta,
eMalta, Malta Rowing Federation, SportMalta, Comune di Cariati / Catalogo generale
dei Beni Culturali, NASA Glenn Research Center and Oyvind Gulbrandsen / FAO are
credited through that bibliography. Native spellings and individual claim
locators remain in the catalogue and app.

The original reduced buoyancy simulation takes conceptual inspiration from
[Tidewater by David Greenheck](https://github.com/dgreenheck/tidewater).
As recorded in `docs/MODELS.md`, no Tidewater source code or model assets are
copied. This acknowledgement does not imply endorsement by any cited author.

Models and drawings are educational reconstructions. Historical and language
review remains pending; they are not certified boatbuilding plans.
