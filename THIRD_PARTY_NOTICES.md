# Third-Party Notices

This repository reuses and adapts open-source modules from the following MIT-licensed projects. Their original copyright notices and license texts are preserved below.

---

## 1. ahmetdotsh/agy-context

- Repository: https://github.com/ahmetdotsh/agy-context
- Reused component: `sidecars/agy_hud/backend/analyzer.mjs` (adapted from `sidecars/context_panel/analyzer.mjs`)
- License: MIT

```text
MIT License

Copyright (c) 2026 Ahmet Sahin

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## 2. ahmetdotsh/agy-usage

- Repository: https://github.com/ahmetdotsh/agy-usage
- Reused / adapted component: Built-in standard API-equivalent model rate table in `sidecars/agy_hud/backend/weekly_usage.mjs` (adapted from `sidecars/usage_panel/usage_reader.mjs`)
- License: MIT

```text
MIT License

Copyright (c) 2026 Ahmet Sahin

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## 3. aishadiaodeqishui/agy-monitor

- Repository: https://github.com/aishadiaodeqishui/agy-monitor
- Reused / adapted components:
  - `sidecars/agy_hud/backend/quota.mjs` (from `sidecars/agy_monitor/backend/quota.mjs`)
  - `sidecars/agy_hud/backend/updater.mjs` (adapted from `sidecars/agy_monitor/backend/updater.mjs`)
  - CDP target discovery, composer anchor lookup, and Windows launcher patterns in `sidecars/agy_hud/backend/cdp_bridge.mjs` and `sidecars/agy_hud/backend/launcher_win.mjs` (from `sidecars/agy_monitor/backend/cdp_theme_bridge.mjs`)
  - Fallback transcript speed computation in `sidecars/agy_hud/backend/speed_tracker.mjs` (from `sidecars/agy_monitor/backend/telemetry.mjs`)
- License: MIT

```text
MIT License

Copyright (c) 2026 AGY Console (agy-monitor) Contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## 4. nkjDSLcvanv/antigravity-codex-theme

- Repository: https://github.com/nkjDSLcvanv/antigravity-codex-theme
- Reused / adapted components:
  - SQLite `gen_metadata` protobuf decoding (`ttft`, `stream`, `outTok`), stream-TPS computation with sanity fallback, and per-turn grouping in `sidecars/agy_hud/backend/sqlite_metrics.mjs` (adapted from `core/daemon/protobuf.mjs` and `core/daemon/sqlite-metrics.mjs`)
  - React fiber toolbar-to-turn matching pattern in `sidecars/agy_hud/hud/hud_runtime.mjs` (adapted from `core/runtime/50-telemetry-ui.js`)
- License: MIT

```text
MIT License

Copyright (c) 2026 antigravity-codex-theme Contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## 5. WhiteBr1ck/agy-powertools

- Repository: https://github.com/WhiteBr1ck/agy-powertools
- Reused / adapted component: Antigravity 2.0 compact Markdown layout CSS selectors and `@layer theme` margin override rules in `sidecars/agy_hud/hud/hud_runtime.mjs` (adapted from `lib/native-ui.js`)
- License: MIT

```text
MIT License

Copyright (c) 2026 WhiteBr1ck / agy-powertools Contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
