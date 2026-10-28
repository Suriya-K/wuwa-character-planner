import type { ReactNode } from "react";

export const metadata = { title: "WuWa Character Planner" };

// Deliberately plain, old-web look: default fonts, bordered tables, no framework
const CSS = `
body { font-family: Verdana, Arial, sans-serif; font-size: 14px; max-width: 760px; margin: 0 auto; padding: 8px 16px; background: #fff; color: #000; }
h1 { font-size: 20px; border-bottom: 2px solid #000; }
table { border-collapse: collapse; width: 100%; }
th, td { border: 1px solid #888; padding: 4px 6px; text-align: left; }
th { background: #ddd; }
input[type=number] { width: 5.5em; }
td:nth-child(2) { white-space: nowrap; }
fieldset { margin: 8px 0; }
.Low { background: #f99; } .OK { background: #9e9; } .High { background: #9cf; }
.Replace { background: #f99; } .Usable { background: #fe8; } .Keep { background: #9e9; }
h2 { font-size: 16px; margin: 16px 0 4px; }
.scroll { overflow-x: auto; }
fieldset.plain { border: 0; padding: 0; margin: 0; min-width: 0; }
.loadout td { vertical-align: top; }
.error { color: #c00; }
.paste { border: 2px dashed #888; padding: 16px; text-align: center; }
.picker { position: relative; display: inline-flex; align-items: center; gap: 6px; max-width: 100%; }
.picker input { width: 16em; max-width: 100%; }
.picker ul { position: absolute; top: 100%; left: 0; z-index: 10; margin: 0; padding: 0; list-style: none; background: #fff; border: 1px solid #888; max-height: 320px; overflow-y: auto; width: 20em; max-width: 90vw; }
.picker li { display: flex; align-items: center; gap: 6px; padding: 2px 6px; cursor: pointer; }
.picker li.active { background: #ddd; }
.pieces { margin: 4px 0; padding-left: 20px; }
select { max-width: 100%; }
/* Wide screens: Stats left, Loadout + Candidate right; phones keep the single column */
@media (min-width: 1100px) {
  body { max-width: 1500px; }
  .cols { display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 3fr); gap: 24px; align-items: start; }
}
`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <style>{CSS}</style>
        <h1>WuWa Character Planner</h1>
        {children}
      </body>
    </html>
  );
}
