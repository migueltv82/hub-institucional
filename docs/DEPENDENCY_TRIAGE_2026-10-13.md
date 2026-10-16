# Dependency triage - 2026-10-13

Triage PASS como inventario. QUALITY GATE: FAIL; no se actualizaron paquetes en esta microtarea.

npm audit --json: 24 paquetes vulnerables (13 high, 10 moderate, 1 low). npm ls confirma las rutas instaladas. Severidad del advisory no acredita explotabilidad en la app; no se aceptan excepciones ni se rebaja el gate.

| Paquete | Severidad | Directa | Rango afectado | Fix npm |
| --- | --- | --- | --- | --- |
| @babel/core | low | False | <=7.29.0 | True |
| @vitest/mocker | moderate | False | 2.1.0 - 4.1.10 | True |
| @xmldom/xmldom | high | False | <=0.8.14 | True |
| argparse | moderate | False | 1.0.0 - 1.0.10 | npm propone cambio major/downgrade: requiere investigacion |
| baseline-browser-mapping | moderate | False | >=2.0.0 <2.11.0 | True |
| brace-expansion | high | False | <=1.1.20 || 2.0.0 - 2.1.6 | True |
| browserslist | high | False | <=4.28.6 | True |
| dompurify | moderate | False | <=3.4.15 | True |
| exceljs | moderate | True | >=3.5.0 | npm propone cambio major/downgrade: requiere investigacion |
| fflate | moderate | False | 0.8.0 - 0.8.2 | True |
| js-yaml | high | False | 4.0.0 - 4.3.1 | True |
| mammoth | moderate | True | >=0.3.30 | npm propone cambio major/downgrade: requiere investigacion |
| nanoid | high | False | <=3.3.17 | True |
| postcss | high | False | <=8.5.22 | True |
| react-router | high | False | 6.0.0 - 7.18.1 | True |
| react-router-dom | high | True | 7.0.0-pre.0 - 7.14.1 | True |
| source-map-js | high | False | 1.0.0 - 1.2.1 | True |
| sprintf-js | moderate | False | * | npm propone cambio major/downgrade: requiere investigacion |
| tmp | high | False | <0.2.6 | True |
| undici | high | False | 7.0.0 - 7.29.0 | True |
| uuid | moderate | False | <11.1.1 | npm propone cambio major/downgrade: requiere investigacion |
| vite | high | True | 8.0.0 - 8.0.15 | True |
| vitest | moderate | True | 2.1.0-beta.1 - 4.1.10 | True |
| ws | high | False | 8.0.0 - 8.20.1 | True |

## Fuentes primarias
- [@babel/core: @babel/core: Arbitrary File Read via sourceMappingURL Comment](https://github.com/advisories/GHSA-4x5r-pxfx-6jf8) - <=7.29.0
- [@vitest/mocker: Vitest: Path Traversal / Arbitrary File Read via @vitest/mocker Redirect Mock](https://github.com/advisories/GHSA-82fw-gwwq-j7x9) - >=2.1.0 <4.1.11
- [@xmldom/xmldom: xmldom: XML fragment injection via invalid EntityReference.nodeName during requireWellFormed serialization](https://github.com/advisories/GHSA-6gmq-8vp8-gcm6) - >=0.7.0 <=0.8.14
- [@xmldom/xmldom: xmldom: Element name injection via createElement() bypasses requireWellFormed](https://github.com/advisories/GHSA-w2rr-34g9-rvrj) - >=0.7.0 <=0.8.13
- [@xmldom/xmldom: xmldom: Attribute name injection via setAttribute() bypasses requireWellFormed](https://github.com/advisories/GHSA-4w3w-2rp5-g8jm) - >=0.7.0 <=0.8.13
- [@xmldom/xmldom: xmldom: Processing Instruction Target Injection Bypasses requireWellFormed](https://github.com/advisories/GHSA-c7q8-3ch8-vqpv) - >=0.7.0 <=0.8.14
- [@xmldom/xmldom: xmldom: DocType `name` Injection Bypasses requireWellFormed](https://github.com/advisories/GHSA-27p8-2357-5qqv) - >=0.7.0 <=0.8.14
- [@xmldom/xmldom: xmldom: Parser silently accepts a not-well-formed end tag whose name is followed by a line break and trailing content](https://github.com/advisories/GHSA-6h8r-xr42-gp59) - >=0.7.0 <=0.8.14
- [@xmldom/xmldom: xmldom: Quadratic-time attribute deduplication](https://github.com/advisories/GHSA-8344-3jmq-59r6) - >=0.7.0 <=0.8.14
- [@xmldom/xmldom: xmldom: End-tag Whitespace-Trim Regex ReDoS — quadratic backtracking in the 0.8.x end-tag parser](https://github.com/advisories/GHSA-x4fp-j954-r2f4) - >=0.7.0 <=0.8.14
- [@xmldom/xmldom: xmldom: Quadratic-memory consumption](https://github.com/advisories/GHSA-965w-775f-mr7g) - >=0.7.0 <=0.8.14
- [@xmldom/xmldom: xmldom: Quadratic-time parsing via the malformed-input recovery path — `parseElementStartPart` re-scan and `normalize()` adjacent-text merge](https://github.com/advisories/GHSA-93r5-fhx6-vmg9) - >=0.7.0 <=0.8.14
- [baseline-browser-mapping: baseline-browser-mapping process termination on invalid input causes denial of service](https://github.com/advisories/GHSA-w5vr-8v7q-w6rv) - >=2.0.0 <2.11.0
- [brace-expansion: brace-expansion: DoS via exponential-time expansion of consecutive non-expanding {} groups](https://github.com/advisories/GHSA-3jxr-9vmj-r5cp) - >=2.0.0 <2.1.2
- [brace-expansion: brace-expansion: DoS via exponential-time expansion of consecutive non-expanding {} groups](https://github.com/advisories/GHSA-3jxr-9vmj-r5cp) - <1.1.16
- [brace-expansion: brace-expansion: DoS via unbounded expansion length causing an out-of-memory process crash](https://github.com/advisories/GHSA-mh99-v99m-4gvg) - <1.1.17
- [brace-expansion: brace-expansion: DoS via unbounded expansion length causing an out-of-memory process crash](https://github.com/advisories/GHSA-mh99-v99m-4gvg) - >=2.0.0 <2.1.3
- [brace-expansion: brace-expansion: DoS via unbounded intermediate arrays, bypassing the CVE-2026-14257 mitigation](https://github.com/advisories/GHSA-rgw5-rvv9-x895) - >=2.0.0 <2.1.4
- [brace-expansion: brace-expansion: DoS via unbounded intermediate arrays, bypassing the CVE-2026-14257 mitigation](https://github.com/advisories/GHSA-rgw5-rvv9-x895) - <1.1.18
- [brace-expansion: brace-expansion: Quadratic-time expansion of the `{a},b}` rewrite causes CPU denial of service](https://github.com/advisories/GHSA-q2hr-2g5m-vwhr) - <1.1.21
- [brace-expansion: brace-expansion: Quadratic-time expansion of the `{a},b}` rewrite causes CPU denial of service](https://github.com/advisories/GHSA-q2hr-2g5m-vwhr) - >=2.0.0 <2.1.7
- [brace-expansion: brace-expansion: DoS via uncontrolled recursion on nested brace groups causing stack exhaustion](https://github.com/advisories/GHSA-qhr7-859c-m2p7) - <1.1.20
- [brace-expansion: brace-expansion: DoS via uncontrolled recursion on nested brace groups causing stack exhaustion](https://github.com/advisories/GHSA-qhr7-859c-m2p7) - >=2.0.0 <2.1.6
- [brace-expansion: brace-expansion: DoS via uncontrolled recursion in parseCommaParts causing stack exhaustion](https://github.com/advisories/GHSA-6j4f-fj2g-mc7p) - <1.1.19
- [brace-expansion: brace-expansion: DoS via uncontrolled recursion in parseCommaParts causing stack exhaustion](https://github.com/advisories/GHSA-6j4f-fj2g-mc7p) - >=2.0.0 <2.1.5
- [browserslist: Browserslist: Unbounded memory growth (no cache eviction) via distinct query results, leading to eventual OOM](https://github.com/advisories/GHSA-c83g-rgw3-j3cx) - <=4.28.6
- [browserslist: Browserslist: Uncaught crash / prototype write via untrusted browserslist-stats.json custom stats (normalizeStats)](https://github.com/advisories/GHSA-73wf-gq98-2v4g) - <=4.28.6
- [dompurify: DOMPurify: Cross-realm IN_PLACE sanitization leaves executable markup intact via realm-bound `instanceof` checks](https://github.com/advisories/GHSA-hpcv-96wg-7vj8) - <=3.4.5
- [dompurify: DOMPurify: IN_PLACE mode preserves attributes of a clobbered root element, allowing XSS via attacker-controlled root DOM](https://github.com/advisories/GHSA-r47g-fvhr-h676) - <=3.4.5
- [dompurify: DOMPurify IN_PLACE Sanitization Bypass via Attached Shadow Root Inside <template>.content](https://github.com/advisories/GHSA-rp9w-3fw7-7cwq) - <=3.4.6
- [dompurify: DOMPurify: Permanent `ALLOWED_ATTR` pollution via `setConfig()` bypassing the hook clone-guard (incomplete fix of the 3.4.7 hook-pollution patch)](https://github.com/advisories/GHSA-cmwh-pvxp-8882) - <=3.4.10
- [dompurify: DOMPurify: Trusted Types policy survives `clearConfig()` and can poison later `RETURN_TRUSTED_TYPE` output](https://github.com/advisories/GHSA-vxr8-fq34-vvx9) - <3.4.9
- [dompurify: DOMPurify: SAFE_FOR_TEMPLATES bypass - template expressions survive sanitization inside <template> content when using DOM output modes](https://github.com/advisories/GHSA-gvmj-g25r-r7wr) - >=3.0.0 <=3.4.7
- [dompurify: DOMPurify: `IN_PLACE` mode trusts attacker-controlled `nodeName` on live non-form nodes, allowing script retention and XSS via attacker-supplied DOM objects](https://github.com/advisories/GHSA-x4vx-rjvf-j5p4) - <=3.4.6
- [dompurify: DOMPurify: Hook mutation of `data.allowedTags` / `data.allowedAttributes` permanently pollutes `DEFAULT_ALLOWED_TAGS` / `DEFAULT_ALLOWED_ATTR`](https://github.com/advisories/GHSA-76mc-f452-cxcm) - <3.4.7
- [dompurify: DOMPurify: IN_PLACE hook removal leaves a detached subtree executable, causing XSS](https://github.com/advisories/GHSA-55q2-fjhq-7xh7) - <=3.4.12
- [dompurify: DOMPurify: `CUSTOM_ELEMENT_HANDLING` bypasses `afterSanitizeElements` for allowed custom elements.](https://github.com/advisories/GHSA-c2j3-45gr-mqc4) - <=3.4.11
- [dompurify: DOMPurify: IN_PLACE returns a force-removed rawtext root whose text carries attacker markup — pure HTML reparse executes](https://github.com/advisories/GHSA-6688-9rhm-gjv2) - <=3.4.15
- [fflate: fflate unzipSync can enter an infinite loop when parsing malformed ZIP64 archives](https://github.com/advisories/GHSA-px8p-9vwx-vf98) - >=0.8.0 <0.8.3
- [js-yaml: JS-YAML: Quadratic-complexity DoS in merge key handling via repeated aliases](https://github.com/advisories/GHSA-h67p-54hq-rp68) - >=4.0.0 <=4.1.1
- [js-yaml: js-yaml: YAML merge-key chains can force quadratic CPU consumption](https://github.com/advisories/GHSA-52cp-r559-cp3m) - >=4.0.0 <4.3.0
- [js-yaml: JS-YAML: Quadratic CPU consumption in !!omap resolution (3.x and 4.x) — CVE-2026-59870 fix not backported](https://github.com/advisories/GHSA-5p4m-2wfm-xmqj) - >=4.0.0 <4.3.1
- [js-yaml: js-yaml: maxTotalMergeKeys does not limit CPU use for empty merge sources](https://github.com/advisories/GHSA-2883-xcg3-v3hh) - >=4.0.0 <4.3.2
- [nanoid: nanoid: non-secure generators can loop indefinitely with negative size](https://github.com/advisories/GHSA-28wg-ghj8-5hjv) - <3.3.16
- [nanoid: nanoid: custom generators can loop indefinitely when size is zero](https://github.com/advisories/GHSA-2v37-7h3g-55p8) - <3.3.18
- [nanoid: nanoid: Integer Overflow or Wraparound](https://github.com/advisories/GHSA-xwg4-73v4-xw9w) - <3.3.12
- [postcss: PostCSS: Arbitrary file read and information disclosure via attacker-controlled sourceMappingURL in CSS comments](https://github.com/advisories/GHSA-6g55-p6wh-862q) - <=8.5.11
- [postcss: PostCSS: incomplete fix of GHSA-6g55-p6wh-862q — attacker-controlled sourceMappingURL reads arbitrary .map files when `from` is unset](https://github.com/advisories/GHSA-fxqj-rqcc-2cmp) - <=8.5.22
- [postcss: PostCSS: Path Traversal in Previous Source Map Auto-Loading (sourceMappingURL) leads to Arbitrary .map File Disclosure](https://github.com/advisories/GHSA-r28c-9q8g-f849) - <=8.5.17
- [react-router: React Router's vendored turbo-stream v2 allows arbitrary constructor invocation via TYPE_ERROR deserialization leading to Unauth RCE](https://github.com/advisories/GHSA-49rj-9fvp-4h2h) - >=7.0.0 <=7.14.1
- [react-router: React Router vulnerable to DoS via unbounded path expansion in __manifest endpoint](https://github.com/advisories/GHSA-8x6r-g9mw-2r78) - >=7.0.0 <7.15.0
- [react-router: React Router: Potential CSRF via PUT/PATCH/DELETE document requests](https://github.com/advisories/GHSA-84g9-w2xq-vcv6) - >=7.12.0 <7.15.1
- [react-router: React Router: Open redirect via backslash in <Link> and useNavigate (CVE-2025-68470 bypass)](https://github.com/advisories/GHSA-wrjc-x8rr-h8h6) - >=6.0.0 <7.18.0
- [react-router: React Router: RSCErrorHandler Missing Protocol Validation (XSS)](https://github.com/advisories/GHSA-h8fp-f39c-q6mh) - >=7.11.0 <7.18.0
- [react-router: React Router: Arbitrary Constructor Injection via deserializeErrors() in React Router SSR Hydration](https://github.com/advisories/GHSA-337j-9hxr-rhxg) - >=6.4.0 <7.18.0
- [react-router: React Router: Unauthenticated Denial of Service via Inefficient Route Matching](https://github.com/advisories/GHSA-chx6-hx7r-mcp5) - >=7.0.0 <7.18.0
- [react-router: React Router: RSC Mode CSRF Bypass Allows Action Execution Before 400 Response](https://github.com/advisories/GHSA-qwww-vcr4-c8h2) - >=7.12.0 <7.18.2
- [source-map-js: source-map-js allows event-loop denial of service through indexed source-map section offsets](https://github.com/advisories/GHSA-68fv-2mgg-jv7q) - >=1.0.0 <1.2.2
- [sprintf-js: sprintf-js vulnerable to denial of service through unbounded precision specifiers](https://github.com/advisories/GHSA-hp3w-g68c-fv3c) - <=1.1.3
- [tmp: tmp has Path Traversal via unsanitized prefix/postfix that enables directory escape](https://github.com/advisories/GHSA-ph9p-34f9-6g65) - <0.2.6
- [undici: undici vulnerable to TLS certificate validation bypass via dropped requestTls in SOCKS5 ProxyAgent](https://github.com/advisories/GHSA-vmh5-mc38-953g) - >=7.23.0 <7.28.0
- [undici: undici vulnerable to HTTP header injection via Set-Cookie percent-decoding](https://github.com/advisories/GHSA-p88m-4jfj-68fv) - >=7.0.0 <7.28.0
- [undici: undici WebSocket client vulnerable to denial of service via fragment count bypass](https://github.com/advisories/GHSA-vxpw-j846-p89q) - >=7.0.0 <7.28.0
- [undici: undici vulnerable to cross-origin request routing via SOCKS5 proxy pool reuse](https://github.com/advisories/GHSA-hm92-r4w5-c3mj) - >=7.23.0 <7.28.0
- [undici: undici vulnerable to Set-Cookie SameSite attribute downgrade via permissive substring matching](https://github.com/advisories/GHSA-g8m3-5g58-fq7m) - >=7.0.0 <7.28.0
- [undici: undici vulnerable to cross-user information disclosure via shared cache whitespace bypass](https://github.com/advisories/GHSA-pr7r-676h-xcf6) - >=7.0.0 <7.28.0
- [undici: undici vulnerable to downstream response desynchronization via retry interceptor](https://github.com/advisories/GHSA-8xcm-r25x-g524) - >=7.0.0 <7.29.0
- [undici: undici vulnerable to cross-user information disclosure and parse-time crash via degenerate private cache directives](https://github.com/advisories/GHSA-4cwx-7wf7-3272) - >=7.0.0 <7.29.0
- [undici: undici vulnerable to CRLF Injection via blob-like body 'type' property](https://github.com/advisories/GHSA-m8rv-5g2x-5cg5) - >=7.0.0 <7.29.0
- [undici: undici vulnerable to cross-user information disclosure via whitespace around equals in Cache-Control directives](https://github.com/advisories/GHSA-jr45-8vmc-qm54) - >=7.0.0 <7.29.0
- [undici: undici vulnerable to cookie attribute injection via unsanitized domain and unparsed setCookie fields](https://github.com/advisories/GHSA-v3r7-h72x-cjcm) - >=7.0.0 <7.29.0
- [undici: undici vulnerable to HTTP response queue poisoning via keep-alive socket reuse](https://github.com/advisories/GHSA-35p6-xmwp-9g52) - >=7.0.0 <7.28.0
- [undici: undici vulnerable to Denial of Service via orphaned RetryHandler response body](https://github.com/advisories/GHSA-pmjh-fq2x-6v4x) - >=7.11.0 <7.29.1
- [undici: undici vulnerable to downstream response splitting via retry interceptor](https://github.com/advisories/GHSA-r53p-7pc4-xj5r) - >=7.0.0 <7.29.1
- [undici: undici vulnerable to Denial of Service via unrequested WebSocket subprotocol](https://github.com/advisories/GHSA-rfgv-xxqx-mfg5) - >=7.0.0 <7.29.1
- [undici: undici vulnerable to Denial of Service via unbounded decompression of compressed responses](https://github.com/advisories/GHSA-3xpg-4rpp-hhhm) - >=7.15.0 <7.29.1
- [undici: undici vulnerable to cross-user cookie disclosure via Set-Cookie caching in shared caches](https://github.com/advisories/GHSA-2jfj-6hjv-fm6j) - >=7.0.0 <7.29.1
- [undici: undici vulnerable to response truncation via oversized chunked responses in the dump interceptor](https://github.com/advisories/GHSA-2gqq-gqf2-x968) - >=7.1.0 <7.29.1
- [undici: undici vulnerable to TLS certificate validation bypass via dropped connect options in BalancedPool](https://github.com/advisories/GHSA-w293-vg96-wgc3) - >=7.24.1 <7.29.1
- [undici: undici vulnerable to caching and replay of unsafe HTTP method responses](https://github.com/advisories/GHSA-8436-99hf-9mmv) - >=7.0.0 <7.29.1
- [undici: undici vulnerable to Denial of Service via WebSocketStream unclean close](https://github.com/advisories/GHSA-rx4f-c7p8-82vq) - >=7.0.0 <7.29.1
- [uuid: uuid: Missing buffer bounds check in v3/v5/v6 when buf is provided](https://github.com/advisories/GHSA-w5hq-g745-h8pq) - <11.1.1
- [vite: launch-editor: NTLMv2 hash disclosure via UNC path handling on Windows](https://github.com/advisories/GHSA-v6wh-96g9-6wx3) - >=8.0.0 <=8.0.15
- [vite: vite: `server.fs.deny` bypass on Windows alternate paths](https://github.com/advisories/GHSA-fx2h-pf6j-xcff) - >=8.0.0 <=8.0.15
- [vitest: Vitest: Path Traversal / Arbitrary File Read via @vitest/mocker Redirect Mock](https://github.com/advisories/GHSA-82fw-gwwq-j7x9) - >=2.1.0 <4.1.11
- [ws: ws: Uninitialized memory disclosure](https://github.com/advisories/GHSA-58qx-3vcg-4xpx) - >=8.0.0 <8.20.1
- [ws: ws: Memory exhaustion DoS from tiny fragments and data chunks](https://github.com/advisories/GHSA-96hv-2xvq-fx4p) - >=8.0.0 <8.21.0

## Unidades de correccion, una por vez
1. Vite 8.0.9 -> 8.0.16 minimo patch: servidor local Windows, fs.deny/UNC. Mantener major8; release/changelog oficial y gate completo. Prioridad inicial por aplicabilidad directa a esta PC.
2. react-router-dom7.14.1/react-router7.14.1: runtime rutas/auth; revisar advisories y changelog y elegir version7 corregida, sin salto major. Latest registro7.18.4 consultado, no es seleccion automatica. Tests de rutas/auth y suite completa.
3. ws8.20.0 via Supabase realtime: parche compatible8 >=8.21.0, latest8.22.0; verificar rango del padre, contratos realtime/auth, no Supabase remoto.
4. @xmldom/xmldom0.8.13 via mammoth: estudiar ultima0.8 segura (>0.8.14), no forzar0.9 sin compatibilidad. Entrada documental potencialmente no confiable: tests de importacion.
5. tmp0.2.5 via exceljs: parche0.2 >=0.2.6 (latest0.2.7), validacion export/import y cleanup temporal.
6. undici7.25.0 via jsdom: >=7.29.1 compatible7 y engines del Node instalado; no salto automatico a latest major. Suite DOM completa.
7. Tooling transitivo: brace-expansion1.1.14/2.1.0 (corregidas>=1.1.21/2.1.7), browserslist4.28.2 (>4.28.6), js-yaml4.1.1 (>4.3.1), nanoid3.3.11 (>3.3.17), postcss8.5.10 (>8.5.22), source-map-js1.2.1 (>1.2.1). Cada paquete con review del padre/rango y gate; no actualizacion global.
8. Moderate/low: mantener inventario y revisar sin usar downgrades propuestos por npm para mammoth/exceljs. No npm audit fix --force.

No se comprobo explotabilidad individual. Las correcciones requieren diff de manifest/lock, npm ls/audit posterior, lint, tests relevantes y suite, build y CHIEF CODE AUDITOR. No bypass de quality gate. Staging/Production/deploy/commit/push=NONE.
