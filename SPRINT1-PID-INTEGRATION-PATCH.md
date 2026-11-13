<!-- Sprint 1 integration patch: add P&ID Investigation tab without changing existing modules -->
<!-- 1. Insert after existing core.js script tag: -->
<!-- <script src="src/pid-schema.js"></script> -->
<!-- 2. Insert before closing body script: new P&ID module registration and DOMContentLoaded extension -->
<!-- 3. Extend exportJSON to include pidDoc when present -->
<!-- 4. Extend importJSON to validate and restore pidDoc -->
<!-- 5. Add nav order: gas, liq, pid, crit, road -->
<!-- This patch is intentionally descriptive because the full index.html replacement requires exact source preservation. -->