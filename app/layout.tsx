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
.error { color: #c00; }
.paste { border: 2px dashed #888; padding: 16px; text-align: center; }
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
