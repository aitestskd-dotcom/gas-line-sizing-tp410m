# Process Hydraulics Workbench (PHW)

Browser-based screening tool for line sizing, pump/system curve performance, industrial troubleshooting and debottlenecking. No build step, no dependencies.

## Modules (v1.0.0)
- Gas Line Sizing: Crane TP-410M isothermal flow, Swamee-Jain friction, outlet pressure, outlet velocity, Mach, choke check, max flow within criteria, NPS size scan.
- Liquid Line & Pump Curve: vendor curve fit, system curve, operating point, efficiency, power, NPSHa vs NPSHr, % BEP, affinity-law speed estimate, findings list.
- Criteria: editable profiles (Generic, ADNOC project values, EGA project values) stored in the browser.
- Roadmap: planned extensions.

## Run
Open `index.html` in a browser (keep the `src` folder next to it), or enable GitHub Pages (Settings > Pages > main / root).

## ADNOC / EGA
No proprietary standard values are embedded. Enter limits from the governing ADNOC or EGA project specification and piping class in the Criteria tab.

## Quality
`node tests/core.test.js` runs the engine tests. Gas solver and pump operating point were cross-checked against an independent SciPy implementation. Screening tool: results must be verified by a qualified engineer.

## Extending
Modules register with `PHW.register({id, title, render(el), calc()})` and reuse `PHW_CORE`.

`gas-line-sizing-tp410m.html` is the original v0 calculator, kept for reference.
